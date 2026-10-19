#!/usr/bin/env python3
"""Local Dilmanc server + Azure Azerbaijani Neural TTS. Python standard library only."""
import argparse
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlsplit
from urllib.request import Request, urlopen
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent
VOICES = {"az-AZ-BanuNeural": "Banu · qadın", "az-AZ-BabekNeural": "Babek · kişi"}
MAX_TEXT = 1200


class SpeechError(Exception):
    def __init__(self, status, message, key=None, params=None):
        super().__init__(message.format(**(params or {})))
        self.status = status
        self.key = key or message
        self.params = params or {}

    def payload(self):
        return {"error": str(self), "key": self.key, "params": self.params}


def read_env(path):
    result = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.strip().partition("=")
            if sep and key in {"AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"}:
                result[key] = value.strip().strip("\"'")
    return result


def credentials(root=ROOT):
    local = read_env(root / ".env")
    return tuple(os.environ.get(k, local.get(k, "")).strip() for k in ("AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"))


def configure(root=ROOT):
    region = input("Azure Speech region (Keys and Endpoint səhifəsindən, məs. westeurope): ").strip()
    key = getpass.getpass("Azure Speech KEY (ekranda görünməyəcək): ").strip()
    if not re.fullmatch(r"[a-z][a-z0-9]{1,30}", region) or not key or "\n" in key or "\r" in key:
        raise ValueError("Açar və ya region düzgün deyil.")
    target = root / ".env"
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(f"AZURE_SPEECH_KEY={key}\nAZURE_SPEECH_REGION={region}\n")
    except BaseException:
        try:
            os.close(fd)
        except OSError:
            pass
        raise
    print("Azure ayarları saxlandı. Açar brauzerə göndərilmir.")


class AzureSpeech:
    def __init__(self, root=ROOT, key="", region="", opener=urlopen):
        self.root, self.key, self.region, self.opener = Path(root), key, region, opener
        self.cache = self.root / ".dilmanc-cache" / "tts"
        # Serialize local synthesis: concurrent identical requests cannot spend twice.
        self.lock = threading.Lock()

    @property
    def configured(self):
        return bool(self.key and re.fullmatch(r"[a-z][a-z0-9]{1,30}", self.region))

    def status(self):
        return {"provider": "azure", "configured": self.configured,
                "voices": [{"name": k, "label": v} for k, v in VOICES.items()],
                "cached": sum(1 for _ in self.cache.glob("*.mp3")) if self.cache.exists() else 0}

    def synthesize(self, text, voice):
        if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT:
            raise SpeechError(400, "Mətn 1-{max} simvol olmalıdır.", params={"max": MAX_TEXT})
        if not isinstance(voice, str) or voice not in VOICES:
            raise SpeechError(400, "Yalnız Azərbaycan dili üçün Banu və Babek seçilə bilər.")
        text = text.strip()
        if any(ord(c) < 32 and c not in "\n\t\r" for c in text):
            raise SpeechError(400, "Mətndə uyğun olmayan simvol var.")
        fingerprint = hashlib.sha256(json.dumps(["azure-mp3-v1-rate-5", voice, text], ensure_ascii=False).encode()).hexdigest()
        target = self.cache / f"{fingerprint}.mp3"
        with self.lock:
            if target.is_file() and target.stat().st_size:
                return target.read_bytes(), True
            if not self.configured:
                raise SpeechError(503, "Azure qurulmayıb. Terminalda python3 server.py --configure başladın.")
            ssml = (f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="az-AZ">'
                    f'<voice name="{voice}"><prosody rate="-5%">{escape(text)}</prosody></voice></speak>')
            request = Request(f"https://{self.region}.tts.speech.microsoft.com/cognitiveservices/v1",
                              data=ssml.encode("utf-8"), method="POST", headers={
                                  "Ocp-Apim-Subscription-Key": self.key,
                                  "Content-Type": "application/ssml+xml; charset=utf-8",
                                  "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
                                  "User-Agent": "Dilmanc/0.3"})
            try:
                with self.opener(request, timeout=20) as response:
                    audio = response.read(8 * 1024 * 1024 + 1)
                    content_type = response.headers.get("Content-Type", "").lower()
            except HTTPError as e:
                if e.code in (401, 403):
                    raise SpeechError(502, "Azure açarı, region və Speech resursuna giriş icazəsini yoxlayın.") from None
                if e.code == 429:
                    raise SpeechError(429, "Azure sorğu limiti dolub. Bir qədər sonra yenidən sınayın.") from None
                raise SpeechError(502, "Azure səsi yarada bilmədi (HTTP {code}).", params={"code": e.code}) from None
            except (URLError, TimeoutError, OSError):
                raise SpeechError(503, "Azure-a bağlantı alınmadı. İnterneti yoxlayın; əvvəl hazırlanmış cümlələr işləyə bilər.") from None
            if not audio or len(audio) > 8 * 1024 * 1024 or not content_type.startswith("audio/"):
                raise SpeechError(502, "Azure-dan etibarlı audio cavabı gəlmədi.")
            self.cache.mkdir(parents=True, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=self.cache, suffix=".tmp")
            try:
                with os.fdopen(fd, "wb") as f:
                    f.write(audio)
                os.replace(tmp, target)
            finally:
                Path(tmp).unlink(missing_ok=True)
            return audio, False


def make_handler(service):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(service.root), **kwargs)

        def allowed(self):
            port = self.server.server_port
            hosts = {f"localhost:{port}", f"127.0.0.1:{port}"}
            origins = {"http://" + host for host in hosts}
            if self.headers.get("Host") not in hosts or (self.headers.get("Origin") and self.headers["Origin"] not in origins):
                self.send_json(403, {"error": "Bu server yalnız lokal Dilmanc üçün açıqdır."})
                return False
            return True

        def send_json(self, code, value):
            body = json.dumps(value, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def end_headers(self):
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "same-origin")
            super().end_headers()

        def public_file(self):
            name = unquote(urlsplit(self.path).path)
            rel = Path(name.lstrip("/") or "index.html")
            if any(p.startswith(".") for p in rel.parts) or rel.parts[0] not in {"index.html", "css", "js", "vendor"}:
                return False
            target = (service.root / rel).resolve()
            return target.is_relative_to(service.root.resolve()) and target.is_file()

        def do_GET(self):
            if not self.allowed():
                return
            if urlsplit(self.path).path == "/api/speech/status":
                self.send_json(200, service.status())
            elif self.public_file():
                super().do_GET()
            else:
                self.send_error(404)

        def do_HEAD(self):
            if not self.allowed():
                return
            if self.public_file():
                super().do_HEAD()
            else:
                self.send_error(404)

        def do_POST(self):
            if not self.allowed():
                return
            if urlsplit(self.path).path != "/api/speech/synthesize":
                return self.send_json(404, {"error": "Ünvan tapılmadı."})
            if self.headers.get("X-Dilmanc-Request") != "1" or self.headers.get_content_type() != "application/json":
                return self.send_json(415, {"error": "JSON sorğusu tələb olunur."})
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 16384:
                    raise SpeechError(413, "Sorğunun ölçüsü uyğun deyil.")
                payload = json.loads(self.rfile.read(size))
                if not isinstance(payload, dict):
                    raise SpeechError(400, "Sorğu düzgün deyil.")
                audio, cached = service.synthesize(payload.get("text"), payload.get("voice", "az-AZ-BanuNeural"))
                self.send_response(200)
                self.send_header("Content-Type", "audio/mpeg")
                self.send_header("Content-Length", str(len(audio)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Dilmanc-Cache", "hit" if cached else "miss")
                self.end_headers()
                self.wfile.write(audio)
            except (ValueError, UnicodeDecodeError):
                self.send_json(400, {"error": "JSON sorğusu düzgün deyil."})
            except SpeechError as e:
                self.send_json(e.status, e.payload())
            except OSError:
                self.send_json(500, {"error": "Audio faylı saxlanmadı. Diskdə boş yeri yoxlayın."})

        def log_message(self, fmt, *args):
            # Never log utterances, credentials or provider responses.
            pass

    return Handler


def main():
    parser = argparse.ArgumentParser(description="Dilmanc + Azure Azərbaycan səsi")
    parser.add_argument("--configure", action="store_true", help="Açar və regionu lokal terminalda daxil edin")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    if args.configure:
        configure()
    key, region = credentials()
    speech = AzureSpeech(key=key, region=region)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(speech))
    print(f"Dilmanc: http://localhost:{args.port}")
    print("Azure ayarları: " + ("daxil edilib; Sına ilə yoxlayın" if speech.configured else "çatışmır; --configure ilə qurun"))
    print("Dayandırmaq üçün Ctrl+C.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
