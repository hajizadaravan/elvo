#!/usr/bin/env python3
"""Local Dilmanc server + Azure Azerbaijani Neural TTS. Python standard library only."""
import argparse
import getpass
import hashlib
import http.client
import io
import json
import os
from pathlib import Path
import re
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlsplit
from urllib.request import Request
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent
VOICES = {"az-AZ-BanuNeural": "Banu · qadın", "az-AZ-BabekNeural": "Babek · kişi"}
MAX_TEXT = 1200
MAX_AUDIO = 8 * 1024 * 1024
# Slightly faster speech and short pauses between sentences. Changing these changes the cache key.
SPEECH_RATE = "+10%"
PAUSES = (("Leading-exact", "50ms"), ("Tailing-exact", "50ms"), ("Sentenceboundary-exact", "150ms"))
STYLE = f"azure-mp3-v2-rate{SPEECH_RATE}-" + "-".join(v for _, v in PAUSES)
STALE = (http.client.RemoteDisconnected, http.client.CannotSendRequest, http.client.BadStatusLine, BrokenPipeError, ConnectionResetError)


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


def ssml(voice, text, pauses=True):
    silence = "".join(f'<mstts:silence type="{kind}" value="{value}"/>' for kind, value in PAUSES) if pauses else ""
    return (f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
            f'xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="az-AZ">'
            f'<voice name="{voice}">{silence}<prosody rate="{SPEECH_RATE}">{escape(text)}</prosody></voice></speak>')


class Fetched(io.BytesIO):
    def __init__(self, body, headers):
        super().__init__(body)
        self.headers = headers


class KeepAliveOpener:
    """Reuse HTTPS connections to Azure, so each phrase does not pay for a new TLS handshake."""

    def __init__(self, limit=4):
        self.idle, self.limit, self.guard = {}, limit, threading.Lock()

    def take(self, host, timeout):
        with self.guard:
            pool = self.idle.get(host, [])
            conn = pool.pop() if pool else None
        if conn is None:
            return http.client.HTTPSConnection(host, timeout=timeout), False
        conn.timeout = timeout
        if conn.sock:
            conn.sock.settimeout(timeout)
        return conn, True

    def give(self, host, conn):
        with self.guard:
            pool = self.idle.setdefault(host, [])
            if len(pool) < self.limit:
                pool.append(conn)
                return
        conn.close()

    def warm(self, url, timeout=10):
        host = urlsplit(url).netloc
        conn = http.client.HTTPSConnection(host, timeout=timeout)
        try:
            conn.connect()
        except OSError:
            conn.close()
            return
        self.give(host, conn)

    def __call__(self, request, timeout):
        parts = urlsplit(request.full_url)
        for attempt in range(2):
            conn, reused = self.take(parts.netloc, timeout)
            try:
                conn.request(request.get_method(), parts.path or "/", body=request.data, headers=dict(request.header_items()))
                response = conn.getresponse()
                body = response.read(MAX_AUDIO + 1)
            except STALE:
                conn.close()
                # Azure may close idle keep-alive connections; retry once on a fresh one.
                if reused and attempt == 0:
                    continue
                raise
            except BaseException:
                conn.close()
                raise
            if response.will_close or len(body) > MAX_AUDIO or not response.isclosed():
                conn.close()
            else:
                self.give(parts.netloc, conn)
            if response.status >= 400:
                raise HTTPError(request.full_url, response.status, response.reason, response.headers, None)
            return Fetched(body, response.headers)


class AzureSpeech:
    def __init__(self, root=ROOT, key="", region="", opener=None):
        self.root, self.key, self.region = Path(root), key, region
        self.opener = opener or KeepAliveOpener()
        self.cache = self.root / ".dilmanc-cache" / "tts"
        # One lock per phrase: identical requests cannot spend twice, different phrases do not wait.
        self.locks, self.guard = {}, threading.Lock()

    @property
    def endpoint(self):
        return f"https://{self.region}.tts.speech.microsoft.com/cognitiveservices/v1"

    def warm(self):
        """Open the Azure connection in the background before the first phrase."""
        if self.configured and hasattr(self.opener, "warm"):
            threading.Thread(target=self.opener.warm, args=(self.endpoint,), daemon=True).start()

    def lock_for(self, fingerprint):
        with self.guard:
            return self.locks.setdefault(fingerprint, threading.Lock())

    @property
    def configured(self):
        return bool(self.key and re.fullmatch(r"[a-z][a-z0-9]{1,30}", self.region))

    def status(self):
        return {"provider": "azure", "configured": self.configured,
                "voices": [{"name": k, "label": v} for k, v in VOICES.items()],
                "cached": sum(1 for _ in self.cache.glob("*.mp3")) if self.cache.exists() else 0}

    def fetch(self, body):
        request = Request(self.endpoint, data=body.encode("utf-8"), method="POST", headers={
            "Ocp-Apim-Subscription-Key": self.key,
            "Content-Type": "application/ssml+xml; charset=utf-8",
            "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
            "User-Agent": "Dilmanc/0.3"})
        with self.opener(request, timeout=20) as response:
            return response.read(MAX_AUDIO + 1), response.headers.get("Content-Type", "").lower()

    def synthesize(self, text, voice):
        if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT:
            raise SpeechError(400, "Mətn 1-{max} simvol olmalıdır.", params={"max": MAX_TEXT})
        if not isinstance(voice, str) or voice not in VOICES:
            raise SpeechError(400, "Yalnız Azərbaycan dili üçün Banu və Babek seçilə bilər.")
        text = text.strip()
        if any(ord(c) < 32 and c not in "\n\t\r" for c in text):
            raise SpeechError(400, "Mətndə uyğun olmayan simvol var.")
        fingerprint = hashlib.sha256(json.dumps([STYLE, voice, text], ensure_ascii=False).encode()).hexdigest()
        target = self.cache / f"{fingerprint}.mp3"
        if target.is_file() and target.stat().st_size:
            return target.read_bytes(), True
        lock = self.lock_for(fingerprint)
        with lock:
            if target.is_file() and target.stat().st_size:
                return target.read_bytes(), True
            if not self.configured:
                raise SpeechError(503, "Azure qurulmayıb. Terminalda python3 server.py --configure başladın.")
            try:
                try:
                    audio, content_type = self.fetch(ssml(voice, text, pauses=True))
                except HTTPError as e:
                    # If the pause tags are rejected, keep speaking with the faster rate only.
                    if e.code != 400:
                        raise
                    audio, content_type = self.fetch(ssml(voice, text, pauses=False))
            except HTTPError as e:
                if e.code in (401, 403):
                    raise SpeechError(502, "Azure açarı, region və Speech resursuna giriş icazəsini yoxlayın.") from None
                if e.code == 429:
                    raise SpeechError(429, "Azure sorğu limiti dolub. Bir qədər sonra yenidən sınayın.") from None
                raise SpeechError(502, "Azure səsi yarada bilmədi (HTTP {code}).", params={"code": e.code}) from None
            except (URLError, TimeoutError, OSError, http.client.HTTPException):
                raise SpeechError(503, "Azure-a bağlantı alınmadı. İnterneti yoxlayın; əvvəl hazırlanmış cümlələr işləyə bilər.") from None
            if not audio or len(audio) > MAX_AUDIO or not content_type.startswith("audio/"):
                raise SpeechError(502, "Azure-dan etibarlı audio cavabı gəlmədi.")
            self.cache.mkdir(parents=True, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=self.cache, suffix=".tmp")
            try:
                with os.fdopen(fd, "wb") as f:
                    f.write(audio)
                os.replace(tmp, target)
            finally:
                Path(tmp).unlink(missing_ok=True)
            with self.guard:
                self.locks.pop(fingerprint, None)
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
    speech.warm()
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
