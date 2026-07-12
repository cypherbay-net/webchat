<p align="center">
  <strong>CypherBay from your terminal</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.9+-ff93b7?style=flat-square">
  <img src="https://img.shields.io/badge/Crypto-AES--256--GCM-ff93b7?style=flat-square">
  <img src="https://img.shields.io/badge/PBKDF2-310%2C000_iter-ff93b7?style=flat-square">
  <img src="https://img.shields.io/badge/dependencies-1-ff93b7?style=flat-square">
</p>

---

```
root@cypherbay:~$ cat about.txt
```

`cypherbay_cli` is a terminal client for [CypherBay](https://cypherbay.net). It speaks the exact same protocol as the browser: PBKDF2-SHA256 (310,000 iterations) key derivation and AES-256-GCM encryption, done locally with the `cryptography` library instead of the Web Crypto API. The server never sees a password or plaintext, whether you connect from a browser or from here.

## Install

```bash
cd cypherbay_cli
pip install -r requirements.txt
python3 cypherbay_cli.py
```

## Usage

By default it connects to `https://cypherbay.net`. Point it elsewhere with `--server <url>` or `/config-server <url>` (saved to `~/.config/cypherbay_cli/config.json`).

| Command | Description |
|---|---|
| `/create [password]` | create a new session (random ID) and join it |
| `/join <session-id> [password]` | join an existing session |
| `/leave` | leave the current session, back to the start screen |
| `/delete-session` | permanently delete the current session on the server |
| `/invite` | print the shareable link for the current session |
| `/alias <name>` | set your display name |
| `/hideid` | toggle hiding the session ID in your prompt (`alias@hidden`) |
| `/file <path>` | encrypt and send a file (max 25 MB) |
| `/download <n>` | decrypt and save a received file by its number |
| `/show-session-ip` | show your public IP and the configured server's IP |
| `/config-server [url]` | show or set the backend server URL |
| `/whoami` | show current connection status |
| `/help` | show all commands |
| `/quit`, `/exit` | quit |

Anything else you type is sent as a chat message. Session ID and password are never passed as command-line arguments to the process; when omitted they're prompted for with hidden input.

## Run your own server

The CLI doesn't need a browser or the web UI at all — it only talks to the PHP API. To point it at your own instance instead of `cypherbay.net`, upload these to any PHP 7.4+ host over HTTPS (the API rejects plain HTTP):

```
your-server/
├── api/
│   ├── create.php
│   ├── send.php
│   ├── messages.php
│   ├── delete.php
│   ├── upload.php
│   ├── file.php
│   ├── cleanup.php     : optional, for the cron job below
│   └── ratelimit.php
└── data/
    ├── sessions/        : chmod 700
    ├── uploads/          : chmod 755
    └── ratelimit/        : chmod 700
```

The `data/` directories can start empty; the API creates the JSON files itself, it just needs the folders to already exist with write permission for the PHP process. If you also want the browser chat to work on that server (not just the CLI), upload the full site instead — `index.html`, `css/`, `js/`, `img/` alongside `api/` and `data/`, see the [main README](../README.md#setup) for the full nginx/Apache config.

Then either run it:

```bash
python3 cypherbay_cli.py --server https://your-domain.com
```

or set it once and forget it:

```
cypherbay> /config-server https://your-domain.com
```

Optional but recommended, a cron job to purge expired sessions:

```bash
*/5 * * * * php /var/www/your-server/api/cleanup.php > /dev/null 2>&1
```

Uploaded files older than 7 days are deleted automatically on each new upload, no separate cron needed for those.

## Structure

```
cypherbay_cli/
├── cypherbay_cli.py    : the whole client, no other local modules
└── requirements.txt    : cryptography
```

## License

MIT, same as the rest of CypherBay. See [../LICENSE](../LICENSE).
