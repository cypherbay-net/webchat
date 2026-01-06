# CypherBay - Anonymous Encrypted Messenger

Anonymous, end-to-end encrypted communication without registration.

## Features

- **End-to-End Encryption** with AES-256-GCM
- **No Registration** - no account, no email
- **No Tracking** - no cookies, no analytics
- **Self-Hosting** - fully self-hostable
- **Zero-Trust** - server only sees encrypted data

## Technology

- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Backend**: PHP
- **Cryptography**: Web Crypto API (PBKDF2 + AES-256-GCM)

## Installation

### Requirements

- PHP 7.4+ with write permissions
- Web server (Apache, Nginx, or PHP Built-in Server)

### Setup

1. Clone repository or copy files:
```bash
git clone <repo-url> cypherbay
cd cypherbay
```

2. Create data directory and set permissions:
```bash
mkdir -p data/sessions
chmod 700 data/sessions
```

3. Start web server:

**With PHP Built-in Server (Development):**
```bash
php -S localhost:8000
```

**With Apache:**
- Set DocumentRoot to the cypherbay directory
- Enable mod_rewrite (optional)

**With Nginx:**
```nginx
server {
    listen 80;
    server_name cypherbay.local;
    root /path/to/cypherbay;
    index index.html;

    location /api/ {
        try_files $uri $uri/ =404;
        fastcgi_pass unix:/var/run/php/php-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

4. Open browser: `http://localhost:8000`

### Cleanup (Optional)

Automatically delete old sessions via cronjob:
```bash
# Every 5 minutes
*/5 * * * * php /path/to/cypherbay/api/cleanup.php
```

## Security

### What CypherBay protects:
- Message content (encrypted with AES-256-GCM)
- Identities (no accounts, no names)

### System Limitations:
- **Metadata** (IP addresses, connection times) is visible to the server
- **Password sharing** must be done via a secure channel
- **Device security** is the user's responsibility
- For maximum anonymity: use **Tor Browser**

## Structure

```
cypherbay/
├── index.html          # Main page (SPA)
├── css/
│   └── style.css       # Styles
├── js/
│   ├── app.js          # Application logic
│   └── crypto.js       # Encryption
├── api/
│   ├── send.php        # Send message
│   ├── messages.php    # Get messages
│   └── cleanup.php     # Delete old sessions
├── data/
│   └── sessions/       # Temporary session data
└── README.md
```

## How it works

1. **Create chat**: A random Session ID is generated
2. **Choose password**: The password is NEVER sent to the server
3. **Share session**: Share Session ID and password via secure channel
4. **Encryption**: Every message is encrypted in the browser with AES-256-GCM
5. **Server as relay**: The server only stores encrypted data temporarily

## License

MIT License - Free to use and modify.

---

**CypherBay** - Privacy by Design
