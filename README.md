# CypherBay

<p align="center">
  <strong>Anonymous, End-to-End Encrypted Web Messenger</strong>
</p>

<p align="center">
  <a href="https://github.com/cypherbay-net/webchat/blob/main/LICENSE"><img src="https://img.shields.io/github/license/cypherbay-net/webchat?color=39ff14&style=flat-square" alt="License"></a>
  <img src="https://img.shields.io/badge/PHP-7.4+-39ff14?style=flat-square" alt="PHP 7.4+">
  <img src="https://img.shields.io/badge/Encryption-AES--256--GCM-39ff14?style=flat-square" alt="AES-256-GCM">
  <img src="https://img.shields.io/badge/No_Tracking-100%25-39ff14?style=flat-square" alt="No Tracking">
</p>

---

## Overview

CypherBay is a minimalist, privacy-focused web messenger. Create encrypted chat rooms without registration, accounts, or personal data. All messages are encrypted in your browser before being sent - the server only sees encrypted data.

## Features

| Feature | Description |
|---------|-------------|
| **E2E Encryption** | AES-256-GCM encryption with PBKDF2 key derivation |
| **Anonymous** | No registration, no accounts, no email required |
| **Zero Tracking** | No cookies, no analytics, no external services |
| **File Sharing** | Share images, videos, and files (via 0x0.st) |
| **Self-Destructing** | Messages auto-delete after 1 hour |
| **Self-Hostable** | Full control over your data |

## Security Model

### What CypherBay protects:
- Message content (end-to-end encrypted)
- Your identity (no accounts, no names)
- Chat history (auto-deletes after 1 hour)

### Limitations (be aware):
- Metadata (IP addresses, connection times) visible to server
- Password must be shared via secure channel (not in chat)
- Uploaded files are NOT encrypted (only the link is)
- Device security is your responsibility

> **For maximum anonymity**: Use Tor Browser

## Quick Start

### Requirements
- PHP 7.4+ with `allow_url_fopen` enabled
- Web server (Apache, Nginx, or PHP built-in)

### Installation

```bash
# Clone the repository
git clone https://github.com/cypherbay-net/webchat.git cypherbay
cd cypherbay

# Create data directory with proper permissions
mkdir -p data/sessions
chmod 700 data/sessions

# Start development server
php -S localhost:8000
```

Open `http://localhost:8000` in your browser.

### Production Setup

<details>
<summary><strong>Apache Configuration</strong></summary>

```apache
<VirtualHost *:443>
    ServerName chat.yourdomain.com
    DocumentRoot /var/www/cypherbay
    
    <Directory /var/www/cypherbay>
        AllowOverride All
        Require all granted
    </Directory>
    
    SSLEngine on
    SSLCertificateFile /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem
</VirtualHost>
```
</details>

<details>
<summary><strong>Nginx Configuration</strong></summary>

```nginx
server {
    listen 443 ssl http2;
    server_name chat.yourdomain.com;
    root /var/www/cypherbay;
    index index.html;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /api/ {
        try_files $uri =404;
        fastcgi_pass unix:/var/run/php/php-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```
</details>

<details>
<summary><strong>Cleanup Cronjob</strong></summary>

Automatically delete expired sessions:

```bash
# Add to crontab (every 5 minutes)
*/5 * * * * php /var/www/cypherbay/api/cleanup.php > /dev/null 2>&1
```
</details>

## Project Structure

```
cypherbay/
├── index.html           # Single-page application
├── css/
│   └── style.css        # Dark theme styles
├── js/
│   ├── app.js           # Application logic
│   └── crypto.js        # Cryptographic functions
├── api/
│   ├── send.php         # Send encrypted message
│   ├── messages.php     # Fetch messages
│   ├── upload.php       # File upload proxy
│   ├── delete.php       # Delete chat session
│   └── cleanup.php      # Remove expired sessions
└── data/
    └── sessions/        # Encrypted session storage
```

## How It Works

```
┌──────────────┐     Encrypted      ┌──────────────┐     Encrypted      ┌──────────────┐
│   Browser A  │ ─────────────────► │    Server    │ ─────────────────► │   Browser B  │
│              │                    │              │                    │              │
│  [Encrypt]   │                    │ [Store Only] │                    │  [Decrypt]   │
│  with AES    │                    │ Cannot Read  │                    │  with AES    │
└──────────────┘                    └──────────────┘                    └──────────────┘
```

1. **Create Chat** → Random Session ID generated
2. **Set Password** → Password never leaves your browser
3. **Share Credentials** → Send Session ID + password via secure channel
4. **Chat** → All messages encrypted client-side with AES-256-GCM
5. **Auto-Cleanup** → Sessions expire after 1 hour of inactivity

## Contributing

Contributions are welcome! Feel free to:

- Report bugs
- Suggest features
- Submit pull requests

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>CypherBay</strong> — Privacy by Design
</p>
