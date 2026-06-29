# CypherBay

<p align="center">
  <strong>Anonymous, end-to-end encrypted web chat — no accounts, no logs</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/cypherbay-net/webchat?color=39ff14&style=flat-square" alt="MIT"></a>
  <img src="https://img.shields.io/badge/PHP-7.4+-39ff14?style=flat-square">
  <img src="https://img.shields.io/badge/Crypto-AES--256--GCM-39ff14?style=flat-square">
  <img src="https://img.shields.io/badge/dependencies-zero-39ff14?style=flat-square">
</p>

---

CypherBay is a self-hosted, browser-based chat. No registration, no persistent accounts. Open a session, share the ID and a password out-of-band, and the conversation stays between you. The server stores only ciphertext it cannot read. Sessions auto-expire after one hour.

## Crypto

Encryption runs entirely in the browser via the Web Crypto API. Keys are derived with PBKDF2-SHA256 at 100 000 iterations, keyed on the concatenation of your password and the session ID. Each message is encrypted with AES-256-GCM using a fresh random 96-bit IV. What gets sent to the server is `base64(IV ‖ ciphertext)`. The password never leaves the client.

## Limitations

The server sees your IP address and connection timestamps. If real anonymity matters, use Tor Browser. The session ID and password have to be shared through a separate channel; sending the password in the chat itself defeats the purpose. File uploads go to [0x0.st](https://0x0.st) unencrypted; only the link is encrypted in the chat. This is not a replacement for Signal.

## Setup

Requires PHP 7.4+ with `allow_url_fopen` enabled and any web server. HTTPS is required in production. The API endpoints reject plain HTTP.

```bash
git clone https://github.com/cypherbay-net/webchat.git cypherbay
cd cypherbay
mkdir -p data/sessions data/ratelimit
chmod 700 data/sessions data/ratelimit
php -S localhost:8000
```

**Nginx**

```nginx
server {
    listen 443 ssl http2;
    server_name chat.yourdomain.com;
    root /var/www/cypherbay;
    index index.html;

    ssl_certificate     /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location / { try_files $uri $uri/ /index.html; }
    location /data/ { deny all; }
}
```

**Apache**

```apache
<VirtualHost *:443>
    ServerName chat.yourdomain.com
    DocumentRoot /var/www/cypherbay

    SSLEngine on
    SSLCertificateFile    /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem

    <Directory "/var/www/cypherbay/data">
        Require all denied
    </Directory>
</VirtualHost>
```

Add a cron job to clean up expired sessions, otherwise they accumulate on disk:

```bash
*/5 * * * * php /var/www/cypherbay/api/cleanup.php > /dev/null 2>&1
```

## Rate limiting

Per-IP, fixed 60-second windows written to `data/ratelimit/`. Typing signals are not rate-limited.

| Endpoint | Limit |
|---|---|
| `api/send.php` | 40 / min |
| `api/messages.php` | 180 / min |

## Structure

```
cypherbay/
├── index.html
├── css/style.css
├── js/
│   ├── app.js          — UI, polling, message handling
│   ├── crypto.js       — PBKDF2 + AES-256-GCM via Web Crypto API
│   └── qrcode.js       — QR code renderer (no dependencies, QR v1)
├── api/
│   ├── send.php        — store encrypted message or typing signal
│   ├── messages.php    — fetch messages since timestamp
│   ├── upload.php      — proxy file upload to 0x0.st
│   ├── delete.php      — delete a session
│   ├── cleanup.php     — CLI: remove expired sessions
│   └── ratelimit.php   — file-based per-IP rate limiter
└── data/
    ├── sessions/       — one JSON file per active session
    └── ratelimit/      — one JSON file per IP per endpoint
```

## How messages flow

```
Browser A                      Server                       Browser B
─────────────────────────────────────────────────────────────────────
encrypt(msg, key)  ──────────► store ciphertext ◄────── poll /messages
                               (cannot decrypt)  ──────► decrypt(msg, key)
```

The server is a dumb relay. It stores `{payload, timestamp}` tuples per session and returns them on request. There is no concept of users, rooms, or message ordering beyond timestamps.

## License

MIT — see [LICENSE](LICENSE).
