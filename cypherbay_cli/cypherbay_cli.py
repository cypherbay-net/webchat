#!/usr/bin/env python3
import argparse
import base64
import getpass
import json
import mimetypes
import os
import re
import secrets
import shutil
import socket
import string
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

try:
    import readline
except ImportError:
    readline = None

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
except ImportError:
    print("Missing dependency. Install it with: pip install cryptography", file=sys.stderr)
    sys.exit(1)

DEFAULT_SERVER = "https://cypherbay.net"
SALT_PREFIX = "CypherBay-v2-"
PBKDF2_ITERATIONS = 310000
POLL_INTERVAL = 2.5
SESSION_ID_CHARS = string.ascii_lowercase + string.digits
SESSION_ID_PATTERN = re.compile(r"^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$")
MAX_FILE_SIZE = 25 * 1024 * 1024
USER_AGENT = "cypherbay_cli/1.0"
IP_ECHO_URL = "https://api.ipify.org?format=text"

CONFIG_DIR = Path.home() / ".config" / "cypherbay_cli"
CONFIG_FILE = CONFIG_DIR / "config.json"


class C:
    # цвета соответствуют переменным из css/style.css (тёмная тема)
    ON = sys.stdout.isatty()
    RESET = "\033[0m" if ON else ""
    BOLD = "\033[1m" if ON else ""
    PINK = "\033[38;2;255;147;183m" if ON else ""
    GREEN = "\033[38;2;95;217;122m" if ON else ""
    YELLOW = "\033[38;2;245;197;66m" if ON else ""
    RED = "\033[38;2;255;95;87m" if ON else ""
    MUTED = "\033[38;2;154;160;170m" if ON else ""
    WHITE = "\033[38;2;255;255;255m" if ON else ""


def ok(msg):
    print(f"{C.GREEN}{msg}{C.RESET}")


def err(msg):
    print(f"{C.RED}{msg}{C.RESET}")


def warn(msg):
    print(f"{C.YELLOW}{msg}{C.RESET}")


_current_prompt = ""


def set_prompt(p):
    global _current_prompt
    _current_prompt = p


def async_print(text):
    if not C.ON:
        print(text)
        return
    buf = readline.get_line_buffer() if readline else ""
    sys.stdout.write("\r\033[K" + text + "\n")
    sys.stdout.write(_current_prompt + buf)
    sys.stdout.flush()


def clear_screen():
    if C.ON:
        sys.stdout.write("\033[2J\033[H")
        sys.stdout.flush()


ASCII_ART = """▄▄▄▄▄▄▄▄▄▄▄▄▄▄      ▄▄▄▄▄▄▄▄  ▄▄▄▄▄▄▄▄      ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄         ▄▄▄▄▄▄▄▄  ▄▄▄▄▄▄▄▄         ▄▄▄▄▄▄▄▄▄▄▄▄▄▄      ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄         ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄            ▄▄▄▄▄▄▄▄▄▄▄▄         ▄▄▄▄▄▄▄▄  ▄▄▄▄▄▄▄▄
 ▄▀        ░ ░▒▓░      ▄      ▓  ▄      █      ▄              ▀▄       ▄      ▓  ▄      █       ▄▀        ░ ░▒▓░      ▄              ▀▄       ▄              ▀▄        ▄▀            ▀▄       ▄      ▓  ▄      █
▐▌            ░▒▒      █      ▒  ▒     ▒█      █               ▐▌      █      ▒  ▒     ▒█      ▐▌            ░▒▒      █               ▐▌      █               ▐▌      ▐▌              ▐▌      █      ▒  ▒     ▒█
█              ░▓      ▓      ░  ░     ░█      ▓      ▒▀▀░     ░▒      ▓      ░  ░     ░█      █              ░▓      ▓      ▒▀▀░     ░█      ▓      ▒▀▀░     ░█      ▓               ░█      ▓      ░  ░     ░█
▓       ▄▄▄▄▄▄▄▄█      ▒      █  █      █      ▒      ░  ▒     ▐▌      ▒      █  █      █      ▓       ▄▄▄▄▄▄▄▄█      ▒      ░  ▒     ▐▌      ▒      ░  ▒     ▐▌      ▒      █▀▀▄      █      ▒      █  █      █
░       █     ·        ▐▌     █▄▄█     ┼░      ░      ▀▀▀▀   ▄▄▀       ░      █▄▄█    ┼┼█      ░       ▓▄▄▄▄ ·        ░      ▀▀▀▀    ▄▀       ░      ▀▀▀▀    ▄▀       ░      █▄▄▒    ┼┼█      ▐▌     █▄▄█     ┼░
█ ┼   ┼ █       ·       ▀▄            ┼┼▒      █┼     ▒▀▀▀▀▀▀          █┼ ┼          ┼┼┼█      █ ┼     ▄▄▄▄▒   ·      █┼     █▀▀▀▄   ▀▄       █┼┼    ▒▀▀▀▄   ▀▄       █┼            ┼┼┼█       ▀▄            ┼┼▒
█┼┼┼ ┼┼┼█▄▄▄▄▄▄▄▄         ▀▀▀▀▀▀▀█┼  ┼┼┼▓      █┼┼   ┼░    ░           █┼┼┼┼ ┼█▀▀█┼   ┼┼█      █┼┼┼   ┼▓▄▄▄▄▄▄▄▄      █┼┼   ┼░   █    ▐▌      █┼┼┼┼ ┼▓   ░    ▐▌      █┼┼   ┼█▀▀█┼   ┼┼█         ▀▀▀▀▀▀▀█┼  ┼┼┼▓
█┼┼┼┼┼┼┼┼┼┼┼┼┼┼┼░      ▓▀▀▀▀▀▀▓  ▒┼  ┼┼┼█      █┼┼┼┼┼┼░  ·░░░          █┼┼┼┼┼┼░  █┼┼┼ ┼┼░      █┼┼┼ ┼┼┼┼┼┼┼┼┼┼┼░      █┼┼┼┼┼┼░   ░   ┼┼░      █┼┼┼┼┼┼▒   ▓┼┼ ┼┼░      █┼┼┼┼┼┼░  █┼┼┼ ┼┼░      ▓▀▀▀▀▀▀▓  ▒┼  ┼┼┼█
▐▌┼┼┼┼┼┼┼┼┼┼┼┼┼┼▒      ▒┼┼┼┼┼┼▀▀▀▀┼┼┼┼┼▐▌      █┼┼┼┼┼┼▒  ░▒▒░          █┼┼┼┼┼┼▒  █┼┼┼┼┼┼▒      ▐▌┼┼┼┼┼┼┼┼┼┼┼┼┼┼▒      █┼┼┼┼┼┼▒   ▒┼┼ ┼┼▒      █┼┼┼┼┼┼░▄▄▄▀┼┼┼┼▐▌      █┼┼┼┼┼┼▒  █┼┼┼┼┼┼▒      ▒┼┼┼┼┼┼▀▀▀▀┼┼┼┼┼▐▌
·▀▄┼┼┼┼┼┼┼┼┼┼┼┼┼▓      ░┼┼┼┼┼┼┼┼┼┼┼┼┼┼▄▀       █┼┼┼┼┼┼▓  ░░░           █┼┼┼┼┼┼▓  █┼┼┼┼┼┼▓      ·▀▄┼┼┼┼┼┼┼┼┼┼┼┼┼▓      █┼┼┼┼┼┼▓   ▓┼┼┼┼┼▓      █┼┼┼┼┼┼┼┼┼┼┼┼┼┼▄▀       █┼┼┼┼┼┼▓  █┼┼┼┼┼┼▓      ░┼┼┼┼┼┼┼┼┼┼┼┼┼┼▄▀
   ▀▀▀▀▀▀▀▀▀▀▀▀▀▀      ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀         ▀▀▀▀▀▀▀▀   ░ ·          ▀▀▀▀▀▀▀▀  ▀▀▀▀▀▀▀▀         ▀▀▀▀▀▀▀▀▀▀▀▀▀▀      ▀▀▀▀▀▀▀▀   ▀▀▀▀▀▀▀      ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀         ▀▀▀▀▀▀▀▀  ▀▀▀▀▀▀▀▀      ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀        """

ASCII_ART_WIDTH = max(len(line) for line in ASCII_ART.split("\n"))


def banner_text():
    cols = shutil.get_terminal_size(fallback=(80, 24)).columns
    title = f"{C.PINK}{ASCII_ART}{C.RESET}\n" if cols >= ASCII_ART_WIDTH else f"{C.PINK}{C.BOLD}CypherBay{C.RESET}\n"
    return (
        title +
        f"{C.MUTED}End-to-end encrypted chat, from your terminal.{C.RESET}\n"
        f"Type {C.PINK}/help{C.RESET} for commands.\n"
    )

HELP_TEXT = """
Commands:
  /create [password]              create a new session (random ID) and join it
  /join <session-id> [password]   join an existing session
  /leave                          leave the current session
  /delete-session                 permanently delete the current session on the server
  /invite                         print the shareable link for the current session
  /alias <name>                   set your display name
  /hideid                          toggle hiding the session ID in your prompt
  /file <path>                    encrypt and send a file (max 25 MB)
  /download <n>                   decrypt and save a received file by its number
  /show-session-ip                show your public IP and the configured server's IP
  /config-server [url]            show or set the backend server URL
  /whoami                         show current connection status
  /help                           show this help
  /quit, /exit                    quit cypherbay_cli

Anything else you type is sent as a chat message (only while joined).
"""


def show_landing(session):
    clear_screen()
    print(banner_text())
    print(f"{C.MUTED}Connected server:{C.RESET} {session.server}")
    print(f"{C.MUTED}Status:{C.RESET} not in a session")
    print()
    print(f"  {C.PINK}/create{C.RESET} [password]              create a new session")
    print(f"  {C.PINK}/join{C.RESET} <session-id> [password]   join an existing session")
    print(f"  {C.PINK}/config-server{C.RESET} [url]            show or set the backend server")
    print(f"  {C.PINK}/help{C.RESET}                           show all commands")
    print()


class Session:
    def __init__(self, server):
        self.server = server
        self.session_id = None
        self.key = None
        self.alias = "Anonymous"
        self.hide_id = False
        self.last_ts = 0
        self.sent_ids = set()
        self.received_files = {}
        self.file_counter = 0
        self.poll_thread = None
        self.stop_event = None
        self.lock = threading.RLock()



def generate_session_id():
    raw = "".join(secrets.choice(SESSION_ID_CHARS) for _ in range(16))
    return f"{raw[0:4]}-{raw[4:8]}-{raw[8:12]}-{raw[12:16]}"


def to_base36(num):
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    if num == 0:
        return "0"
    result = ""
    n = num
    while n:
        n, r = divmod(n, 36)
        result = digits[r] + result
    return result


def generate_message_id():
    ts36 = to_base36(int(time.time() * 1000))
    return f"{ts36}-{secrets.token_hex(4)}"


def derive_key(password, session_id):
    salt = (SALT_PREFIX + session_id).encode()
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=PBKDF2_ITERATIONS)
    return kdf.derive(password.encode())


# AESGCM.encrypt дописывает tag в конец шифртекста -- как и Web Crypto API в браузере,
# поэтому формат iv+ciphertext совместим с js/crypto.js без изменений
def encrypt_payload(plaintext, key):
    iv = secrets.token_bytes(12)
    ct = AESGCM(key).encrypt(iv, plaintext.encode(), None)
    return base64.b64encode(iv + ct).decode()


def decrypt_payload(data_b64, key):
    try:
        raw = base64.b64decode(data_b64)
        iv, ct = raw[:12], raw[12:]
        return AESGCM(key).decrypt(iv, ct, None).decode()
    except Exception:
        return None



def _do_request(req, timeout=10):
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            try:
                return resp.status, (json.loads(body) if body else {})
            except json.JSONDecodeError:
                return resp.status, {"raw": body}
    except urllib.error.HTTPError as e:
        body = e.read()
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"error": body.decode(errors="replace") if body else str(e)}
    except urllib.error.URLError as e:
        return 0, {"error": str(e.reason)}
    except socket.timeout:
        return 0, {"error": "timeout"}


def api_post(server, path, payload, timeout=10):
    url = server.rstrip("/") + path
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={"Content-Type": "application/json", "User-Agent": USER_AGENT},
    )
    return _do_request(req, timeout)


def api_get(server, path, params, timeout=10):
    url = server.rstrip("/") + path + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": USER_AGENT})
    return _do_request(req, timeout)


# ручной multipart/form-data: в stdlib нет своего энкодера, как есть у requests
def api_upload_file(server, encrypted_blob, timeout=30):
    boundary = secrets.token_hex(16)
    parts = [
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="file"; filename="encrypted.bin"\r\n',
        b"Content-Type: application/octet-stream\r\n\r\n",
        encrypted_blob,
        f"\r\n--{boundary}--\r\n".encode(),
    ]
    data = b"".join(parts)
    url = server.rstrip("/") + "/api/upload.php"
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "User-Agent": USER_AGENT},
    )
    return _do_request(req, timeout)


def fetch_url_bytes(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read()



def load_config():
    try:
        return json.loads(CONFIG_FILE.read_text())
    except Exception:
        return {}


def save_config(cfg):
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg))
    try:
        os.chmod(CONFIG_FILE, 0o600)
    except Exception:
        pass



def poll_loop(session, stop_event):
    while not stop_event.wait(POLL_INTERVAL):
        with session.lock:
            sid, key, since, server = session.session_id, session.key, session.last_ts, session.server
        if not sid:
            continue
        status, resp = api_get(server, "/api/messages.php", {"sessionId": sid, "since": since})
        if status != 200:
            continue
        for msg in resp.get("messages", []):
            ts = msg.get("timestamp", 0)
            with session.lock:
                if ts > session.last_ts:
                    session.last_ts = ts
            plaintext = decrypt_payload(msg.get("payload", ""), key)
            if plaintext is None:
                continue
            try:
                data = json.loads(plaintext)
            except Exception:
                continue
            if data.get("id") in session.sent_ids:
                continue
            print_incoming(session, data)


def print_incoming(session, data):
    ts = data.get("timestamp", int(time.time() * 1000))
    ts_str = time.strftime("%H:%M:%S", time.localtime(ts / 1000))
    alias = data.get("alias", "Anonymous")
    if data.get("type") == "file":
        with session.lock:
            session.file_counter += 1
            idx = session.file_counter
            session.received_files[idx] = data
        size_kb = data.get("fileSize", 0) / 1024
        async_print(f"{C.MUTED}[{ts_str}]{C.RESET} {C.BOLD}{alias}{C.RESET} sent a file: {data.get('fileName')} ({size_kb:.1f} KB) {C.MUTED}-- /download {idx} to save{C.RESET}")
    else:
        async_print(f"{C.MUTED}[{ts_str}]{C.RESET} {C.BOLD}{alias}{C.RESET}: {data.get('text', '')}")



def cmd_create(session, arg):
    if session.session_id:
        err("Already in a session. /leave first.")
        return
    password = arg.strip() if arg else getpass.getpass("Password (min 8 chars): ")
    if len(password) < 8:
        err("Password must be at least 8 characters.")
        return
    sid = generate_session_id()
    status, resp = api_post(session.server, "/api/create.php", {"sessionId": sid})
    if status != 201:
        err(f"Could not create session: {resp.get('error', status)}")
        return
    _enter(session, sid, password)
    ok(f"Session created: {sid}")
    cmd_invite(session)


def cmd_join(session, arg):
    if session.session_id:
        err("Already in a session. /leave first.")
        return
    parts = arg.split(maxsplit=1)
    if not parts:
        print("Usage: /join <session-id> [password]")
        return
    sid = parts[0].lower()
    if not SESSION_ID_PATTERN.match(sid):
        err("Invalid session ID format (expected xxxx-xxxx-xxxx-xxxx).")
        return
    password = parts[1] if len(parts) > 1 else getpass.getpass("Password: ")
    _enter(session, sid, password)


# пароль не проверяется на сервере при входе, как и в веб-клиенте --
# неверный ключ просто не расшифрует уже лежащие в сессии сообщения
def _enter(session, sid, password):
    with session.lock:
        session.session_id = sid
        session.key = derive_key(password, sid)
        session.last_ts = 0
        session.sent_ids = set()
        session.received_files = {}
        session.file_counter = 0
        session.stop_event = threading.Event()
    t = threading.Thread(target=poll_loop, args=(session, session.stop_event), daemon=True)
    session.poll_thread = t
    t.start()
    ok(f"Joined {sid}. All messages are end-to-end encrypted.")


def cmd_leave(session, silent=False, redraw=True):
    if not session.session_id:
        if not silent:
            err("Not in a session.")
        return
    session.stop_event.set()
    if session.poll_thread:
        session.poll_thread.join(timeout=2)
    with session.lock:
        session.session_id = None
        session.key = None
        session.last_ts = 0
        session.sent_ids = set()
        session.received_files = {}
    if redraw:
        show_landing(session)
    elif not silent:
        ok("Left session.")


def cmd_delete_session(session):
    if not session.session_id:
        err("Not in a session.")
        return
    sid = session.session_id
    confirm = input(f"Type the session ID ({sid}) to confirm permanent deletion: ").strip()
    if confirm != sid:
        err("Confirmation did not match. Aborted.")
        return
    status, resp = api_post(session.server, "/api/delete.php", {"sessionId": sid})
    if status == 200:
        ok("Session deleted on server.")
        cmd_leave(session, silent=True)
    else:
        err(f"Could not delete session: {resp.get('error', status)}")


def cmd_invite(session):
    if not session.session_id:
        err("Not in a session.")
        return
    link = f"{session.server}/#{session.session_id}"
    print(f"Session ID: {session.session_id}")
    print(f"Link (password not included, share it separately): {link}")


def cmd_alias(session, arg):
    name = arg.strip()
    if not name:
        print(f"Current alias: {session.alias}")
        return
    session.alias = name[:40]
    print(f"Alias set to: {session.alias}")


def cmd_hideid(session):
    session.hide_id = not session.hide_id
    if session.hide_id:
        ok("Session ID hidden in prompt.")
    else:
        ok("Session ID visible in prompt.")


def cmd_whoami(session):
    print(f"Server: {session.server}")
    if session.session_id:
        print(f"Session: {session.session_id}")
        print(f"Alias: {session.alias}")
    else:
        err("Not connected to a session.")


def cmd_show_ip(session):
    host = urllib.parse.urlparse(session.server).hostname
    print(f"Resolving server host ({host})...")
    try:
        server_ip = socket.gethostbyname(host)
        print(f"  Server IP: {server_ip}")
    except Exception as e:
        print(f"  Server IP: could not resolve ({e})")

    print(f"Checking your public IP via {IP_ECHO_URL} (third-party service, not part of CypherBay)...")
    try:
        status, body = fetch_url_bytes(IP_ECHO_URL, timeout=5)
        print(f"  Your public IP: {body.decode().strip()}")
    except Exception as e:
        print(f"  Your public IP: could not determine ({e})")


def cmd_config_server(session, arg):
    if not arg:
        print(f"Current server: {session.server}")
        return
    url = arg.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
    if url.startswith("http://"):
        warn("http:// is insecure; the backend requires HTTPS anyway.")
    if session.session_id:
        warn("changing server while in a session does not move your session -- /leave first if you meant to switch backends.")
    session.server = url.rstrip("/")
    save_config({"server": session.server})
    ok(f"Server set to {session.server}")


def guess_file_type(mime):
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("video/"):
        return "video"
    if mime.startswith("audio/"):
        return "audio"
    return "file"


def send_file(session, path_str):
    if not session.session_id or not session.key:
        err("Not connected. Use /create or /join first.")
        return
    if not path_str:
        print("Usage: /file <path>")
        return
    path = Path(path_str).expanduser()
    if not path.is_file():
        print(f"File not found: {path}")
        return
    size = path.stat().st_size
    if size > MAX_FILE_SIZE:
        err("File too large. Max 25 MB.")
        return
    raw = path.read_bytes()
    iv = secrets.token_bytes(12)
    ct = AESGCM(session.key).encrypt(iv, raw, None)
    print("Uploading...")
    status, resp = api_upload_file(session.server, iv + ct)
    if status != 200 or not resp.get("success"):
        err(f"Upload failed: {resp.get('error', status)}")
        return
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    msg_id = generate_message_id()
    now = int(time.time() * 1000)
    data = {
        "id": msg_id, "alias": session.alias, "type": "file",
        "fileType": guess_file_type(mime), "mimeType": mime,
        "fileName": path.name, "fileSize": size, "url": resp["url"], "timestamp": now,
    }
    encrypted = encrypt_payload(json.dumps(data), session.key)
    with session.lock:
        session.sent_ids.add(msg_id)
    status2, resp2 = api_post(session.server, "/api/send.php", {"sessionId": session.session_id, "payload": encrypted})
    if status2 == 200:
        ok(f"Sent file: {path.name} ({size} bytes)")
    else:
        err(f"File uploaded but message could not be sent: {resp2.get('error', status2)}")


def download_file(session, arg):
    if not session.session_id or not session.key:
        err("Not connected.")
        return
    try:
        idx = int(arg.strip())
    except ValueError:
        print("Usage: /download <n>")
        return
    entry = session.received_files.get(idx)
    if not entry:
        print("No such file number. Files are numbered as they arrive.")
        return
    try:
        status, raw = fetch_url_bytes(entry["url"])
    except Exception as e:
        err(f"Download failed: {e}")
        return
    if status != 200 or len(raw) < 13:
        err(f"Download failed (HTTP {status}).")
        return
    iv, ct = raw[:12], raw[12:]
    try:
        plaintext = AESGCM(session.key).decrypt(iv, ct, None)
    except Exception:
        err("Could not decrypt file (wrong key or corrupted data).")
        return
    dest = Path.cwd() / entry.get("fileName", f"cypherbay-file-{idx}")
    counter = 1
    original = dest
    while dest.exists():
        dest = original.with_name(f"{original.stem}({counter}){original.suffix}")
        counter += 1
    dest.write_bytes(plaintext)
    ok(f"Saved to {dest}")



DISPATCH = {
    "/create": lambda s, a: cmd_create(s, a),
    "/join": lambda s, a: cmd_join(s, a),
    "/leave": lambda s, a: cmd_leave(s),
    "/delete-session": lambda s, a: cmd_delete_session(s),
    "/invite": lambda s, a: cmd_invite(s),
    "/alias": lambda s, a: cmd_alias(s, a),
    "/hideid": lambda s, a: cmd_hideid(s),
    "/file": lambda s, a: send_file(s, a),
    "/download": lambda s, a: download_file(s, a),
    "/show-session-ip": lambda s, a: cmd_show_ip(s),
    "/config-server": lambda s, a: cmd_config_server(s, a),
    "/whoami": lambda s, a: cmd_whoami(s),
    "/help": lambda s, a: print(HELP_TEXT),
}


def send_message(session, text):
    if not session.session_id or not session.key:
        err("Not connected. Use /create or /join first.")
        return
    msg_id = generate_message_id()
    now = int(time.time() * 1000)
    data = {"id": msg_id, "alias": session.alias, "text": text, "timestamp": now}
    encrypted = encrypt_payload(json.dumps(data), session.key)
    with session.lock:
        session.sent_ids.add(msg_id)
    status, resp = api_post(session.server, "/api/send.php", {"sessionId": session.session_id, "payload": encrypted})
    if status == 200:
        ts_str = time.strftime("%H:%M:%S", time.localtime(now / 1000))
        print(f"{C.MUTED}[{ts_str}]{C.RESET} {C.BOLD}{session.alias}{C.RESET} {C.PINK}(you){C.RESET}: {text}")
    elif status == 429:
        warn("Rate limit: wait a moment.")
    else:
        err(f"Message could not be sent: {resp.get('error', status)}")


def build_prompt(session):
    if not session.session_id:
        return f"{C.PINK}cypherbay>{C.RESET} "
    ident = "hidden" if session.hide_id else session.session_id
    sep = "@" if session.hide_id else "#"
    return f"{C.PINK}{session.alias}{sep}{ident}>{C.RESET} "


def repl(session):
    show_landing(session)
    while True:
        try:
            prompt = build_prompt(session)
            set_prompt(prompt)
            line = input(prompt)
        except (EOFError, KeyboardInterrupt):
            print()
            break
        line = line.strip()
        if not line:
            continue
        if line.startswith("/"):
            head, _, rest = line.partition(" ")
            if head.lower() in ("/quit", "/exit"):
                break
            handler = DISPATCH.get(head.lower())
            if handler:
                handler(session, rest.strip())
            else:
                err(f"Unknown command: {head}. Type /help.")
        else:
            send_message(session, line)
    cmd_leave(session, silent=True, redraw=False)
    print("Bye.")


def main():
    parser = argparse.ArgumentParser(description="CypherBay terminal client")
    parser.add_argument("--server", help="Backend server URL (overrides saved config)")
    args = parser.parse_args()

    cfg = load_config()
    server = args.server.rstrip("/") if args.server else cfg.get("server", DEFAULT_SERVER)
    session = Session(server)
    repl(session)


if __name__ == "__main__":
    main()
