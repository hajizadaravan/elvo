import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer

from server import AzureSpeech, SpeechError, make_handler, credentials


class AudioResponse(io.BytesIO):
    headers = {"Content-Type": "audio/mpeg"}


class SpeechTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.requests = []

    def tearDown(self):
        self.temp.cleanup()

    def opener(self, request, timeout):
        self.requests.append(request)
        self.assertEqual(timeout, 20)
        return AudioResponse(b"ID3-test-audio")

    def service(self, **kwargs):
        return AzureSpeech(self.root, key="test-secret-not-a-real-key", region="westeurope", opener=kwargs.pop("opener", self.opener), **kwargs)

    def test_ssml_escapes_text_and_uses_azerbaijani_voice(self):
        service = self.service()
        audio, cached = service.synthesize('Əli & <baş> "ağrı"', "az-AZ-BanuNeural")
        self.assertFalse(cached)
        self.assertTrue(audio.startswith(b"ID3"))
        r = self.requests[0]
        self.assertEqual(r.full_url, "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1")
        self.assertEqual(r.get_header("Ocp-apim-subscription-key"), "test-secret-not-a-real-key")
        self.assertIn('xml:lang="az-AZ"', r.data.decode())
        self.assertIn("Əli &amp; &lt;baş&gt;", r.data.decode())
        self.assertNotIn("test-secret", r.data.decode())

    def test_cache_persists_and_works_without_credentials(self):
        service = self.service()
        first, _ = service.synthesize("Başım ağrıyır.", "az-AZ-BanuNeural")
        second, cached = AzureSpeech(self.root).synthesize("Başım ağrıyır.", "az-AZ-BanuNeural")
        self.assertTrue(cached)
        self.assertEqual(first, second)
        self.assertEqual(len(self.requests), 1)
        self.assertEqual(service.status()["cached"], 1)
        self.assertNotIn("test-secret", json.dumps(service.status()))

    def test_different_voice_does_not_reuse_wrong_audio(self):
        service = self.service()
        service.synthesize("Salam!", "az-AZ-BanuNeural")
        service.synthesize("Salam!", "az-AZ-BabekNeural")
        self.assertEqual(len(self.requests), 2)

    def test_missing_key_invalid_text_and_non_az_voice(self):
        with self.assertRaises(SpeechError) as e:
            AzureSpeech(self.root).synthesize("Salam", "az-AZ-BanuNeural")
        self.assertEqual(e.exception.status, 503)
        for text, voice in [("", "az-AZ-BanuNeural"), ("x" * 1201, "az-AZ-BanuNeural"), ("x\x00", "az-AZ-BanuNeural"), ("Salam", "tr-TR-AhmetNeural"), ("Salam", [])]:
            with self.assertRaises(SpeechError):
                self.service().synthesize(text, voice)
        self.assertEqual(len(self.requests), 0)

    def test_provider_auth_and_limit_errors_are_safe(self):
        for code, expected in [(401, 502), (403, 502), (429, 429), (500, 502)]:
            def fail(request, timeout):
                raise HTTPError(request.full_url, code, "secret-provider-body", {}, None)
            with self.assertRaises(SpeechError) as e:
                self.service(opener=fail).synthesize("Salam!", "az-AZ-BanuNeural")
            self.assertEqual(e.exception.status, expected)
            self.assertNotIn("secret-provider-body", str(e.exception))

    def test_concurrent_identical_requests_only_synthesize_once(self):
        service = self.service()
        threads = [threading.Thread(target=lambda: service.synthesize("Salam!", "az-AZ-BanuNeural")) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(len(self.requests), 1)

    def test_env_file_and_environment_override(self):
        (self.root / ".env").write_text("AZURE_SPEECH_KEY=file-key\nAZURE_SPEECH_REGION=westeurope\n", encoding="utf-8")
        with patch.dict("os.environ", {"AZURE_SPEECH_KEY": "env-key", "AZURE_SPEECH_REGION": "eastus"}):
            self.assertEqual(credentials(self.root), ("env-key", "eastus"))

    def test_http_flow_and_secret_files_are_not_served(self):
        (self.root / "index.html").write_text("<html>Dilmanc</html>")
        (self.root / ".env").write_text("PRIVATE-KEY")
        (self.root / ".git").mkdir()
        (self.root / ".git/config").write_text("private config")
        (self.root / "js").mkdir()
        (self.root / "js/app.js").write_text("export const value=1")
        server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(self.service()))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_port}"
        try:
            with urlopen(base + "/api/speech/status") as r:
                self.assertTrue(json.load(r)["configured"])
            with urlopen(base + "/?nocam") as r:
                self.assertIn(b"Dilmanc", r.read())
            for url in ["/.env", "/.git/config", "/%2eenv", "/js/../.env", "/.dilmanc-cache/tts/file.mp3", "/server.py", "/js/"]:
                with self.assertRaises(HTTPError) as e:
                    urlopen(base + url)
                self.assertEqual(e.exception.code, 404)
            data = json.dumps({"text": "Salam!", "voice": "az-AZ-BanuNeural"}).encode()
            for origin, marker, expected in [("https://evil.example", "1", 403), (base, "", 415)]:
                with self.assertRaises(HTTPError) as e:
                    urlopen(Request(base + "/api/speech/synthesize", data=data, headers={"Content-Type": "application/json", "Origin": origin, "X-Dilmanc-Request": marker}))
                self.assertEqual(e.exception.code, expected)
            for expected_cache in ("miss", "hit"):
                request = Request(base + "/api/speech/synthesize", data=data, headers={"Content-Type": "application/json", "Origin": base, "X-Dilmanc-Request": "1"})
                with urlopen(request) as r:
                    self.assertEqual(r.headers["X-Dilmanc-Cache"], expected_cache)
                    self.assertEqual(r.headers["Content-Type"], "audio/mpeg")
                    self.assertEqual(r.read(), b"ID3-test-audio")
            self.assertEqual(len(self.requests), 1)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
