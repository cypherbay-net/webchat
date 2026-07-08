(function() {
    'use strict';

    const state = {
        currentPage: 'landing',
        sessionId: null,
        password: null,
        cryptoKey: null,
        localAlias: 'Anonymous',
        clientId: null,
        pollingInterval: null,
        lastMessageTimestamp: 0,
        sentMessageIds: new Set(),
        connected: false,
        lastTypingSent: 0,
        unreadCount: 0,
        sessionStartTime: null,
        sessionTimer: null,
        soundEnabled: true,
        darkMode: true,
        originalTitle: 'CypherBay',
        pollErrorCount: 0,
        msgCount: 0,
        msgWindowStart: 0
    };

    const MSG_LIMIT = 80;

    const elements = {};
    const POLL_INTERVAL = 2500;
    const SESSION_DURATION = 3600000;
    const TYPING_INTERVAL = 2000;
    const TYPING_DISPLAY_TIMEOUT = 3500;

    function init() {
        loadTheme();
        loadSoundPref();
        cacheElements();
        bindEvents();
        updateThemeIcon();
        updateSoundIcon();
        checkResumeCookie();
        showPage('landing');
        checkUrlPath();
        checkUrlHash();
    }

    function loadTheme() {
        const saved = localStorage.getItem('cypherbay-theme');
        state.darkMode = saved !== 'light';
        document.documentElement.setAttribute('data-theme', state.darkMode ? 'dark' : 'light');
    }

    function loadSoundPref() {
        const saved = localStorage.getItem('cypherbay-sound');
        state.soundEnabled = saved !== 'false';
    }

    function cacheElements() {
        elements.pages = {
            landing: document.getElementById('landing'),
            create: document.getElementById('create'),
            join: document.getElementById('join'),
            chat: document.getElementById('chat')
        };
        elements.btnCreate = document.getElementById('btn-create');
        elements.btnJoin = document.getElementById('btn-join');
        elements.themeToggle = document.getElementById('theme-toggle');
        elements.sessionId = document.getElementById('session-id');
        elements.copySession = document.getElementById('copy-session');
        elements.copyLink = document.getElementById('copy-link');
        elements.regenerateSession = document.getElementById('regenerate-session');
        elements.createPassword = document.getElementById('create-password');
        elements.btnStartChat = document.getElementById('btn-start-chat');
        elements.qrCanvas = document.getElementById('qr-canvas');
        elements.pwStrengthCreate = document.getElementById('pw-strength-create');
        elements.joinSession = document.getElementById('join-session');
        elements.joinPassword = document.getElementById('join-password');
        elements.btnJoinChat = document.getElementById('btn-join-chat');
        elements.pwStrengthJoin = document.getElementById('pw-strength-join');
        elements.btnLeaveChat = document.getElementById('btn-leave-chat');
        elements.chatSessionId = document.getElementById('chat-session-id');
        elements.connectionStatus = document.getElementById('connection-status');
        elements.sessionTimerEl = document.getElementById('session-timer');
        elements.soundToggle = document.getElementById('sound-toggle');
        elements.messages = document.getElementById('messages');
        elements.typingIndicator = document.getElementById('typing-indicator');
        elements.scrollToBottomBtn = document.getElementById('scroll-to-bottom');
        elements.localAlias = document.getElementById('local-alias');
        elements.messageForm = document.getElementById('message-form');
        elements.messageInput = document.getElementById('message-input');
        elements.btnSend = document.getElementById('btn-send');
        elements.fileInput = document.getElementById('file-input');
        elements.btnAttach = document.getElementById('btn-attach');
        elements.uploadProgress = document.getElementById('upload-progress');
        elements.btnDeleteChat = document.getElementById('btn-delete-chat');
        elements.btnInvite = document.getElementById('btn-invite');
        elements.msgRateCounter = document.getElementById('msg-rate-counter');
        elements.rememberSession = document.getElementById('remember-session');
        elements.resumeSession = document.getElementById('resume-session');
        elements.resumeSessionId = document.getElementById('resume-session-id');
        elements.btnResume = document.getElementById('btn-resume');
        elements.btnClearSession = document.getElementById('btn-clear-session');
        elements.backButtons = document.querySelectorAll('.btn-back');
    }

    function checkUrlPath() {
        const seg = window.location.pathname.replace(/^\//, '').toLowerCase();
        if (seg && CypherCrypto.isValidSessionId(seg)) {
            elements.joinSession.value = seg;
            showPage('join');
            window.history.replaceState(null, '', '/');
        }
    }

    function checkUrlHash() {
        const hash = window.location.hash.slice(1);
        if (hash && CypherCrypto.isValidSessionId(hash)) {
            elements.joinSession.value = hash;
            showPage('join');
            window.history.replaceState(null, '', window.location.pathname);
        }
    }

    function bindEvents() {
        document.addEventListener('click', function() {
            const ctx = _getAudioCtx();
            if (ctx && ctx.state === 'suspended') ctx.resume();
        }, { once: true });

        elements.btnCreate.addEventListener('click', () => {
            const id = CypherCrypto.generateSessionId();
            elements.sessionId.value = id;
            elements.createPassword.value = '';
            elements.btnStartChat.disabled = true;
            updatePasswordStrength('', elements.pwStrengthCreate);
            showPage('create');
            renderQRCode(id);
        });

        elements.btnJoin.addEventListener('click', () => {
            elements.joinSession.value = '';
            elements.joinPassword.value = '';
            elements.btnJoinChat.disabled = true;
            updatePasswordStrength('', elements.pwStrengthJoin);
            showPage('join');
        });

        elements.themeToggle.addEventListener('click', toggleTheme);

        elements.copySession.addEventListener('click', () => {
            copyToClipboard(elements.sessionId.value);
        });

        elements.copyLink.addEventListener('click', () => {
            copyToClipboard(sessionUrl(elements.sessionId.value));
        });

        elements.regenerateSession.addEventListener('click', () => {
            const id = CypherCrypto.generateSessionId();
            elements.sessionId.value = id;
            renderQRCode(id);
        });

        elements.createPassword.addEventListener('input', () => {
            const pw = elements.createPassword.value;
            elements.btnStartChat.disabled = pw.length < 8;
            updatePasswordStrength(pw, elements.pwStrengthCreate);
        });

        elements.btnStartChat.addEventListener('click', async () => {
            const sessionId = elements.sessionId.value;
            const password = elements.createPassword.value;
            if (sessionId && password) await enterChat(sessionId, password);
        });

        elements.joinSession.addEventListener('input', (e) => {
            let clean = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
            let formatted = '';
            for (let i = 0; i < clean.length; i++) {
                if (i > 0 && i % 4 === 0) formatted += '-';
                formatted += clean[i];
            }
            e.target.value = formatted;
            validateJoinForm();
        });

        elements.joinPassword.addEventListener('input', () => {
            validateJoinForm();
            updatePasswordStrength(elements.joinPassword.value, elements.pwStrengthJoin);
        });

        elements.btnJoinChat.addEventListener('click', async () => {
            const sessionId = elements.joinSession.value.trim();
            const password = elements.joinPassword.value;
            if (CypherCrypto.isValidSessionId(sessionId) && password) {
                await enterChat(sessionId, password);
            }
        });

        elements.btnLeaveChat.addEventListener('click', leaveChat);

        elements.localAlias.addEventListener('input', () => {
            state.localAlias = elements.localAlias.value.trim() || 'Anonymous';
        });

        elements.messageForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await sendMessage();
        });

        elements.messageInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                await sendMessage();
            }
        });

        elements.messageInput.addEventListener('input', () => {
            elements.messageInput.style.height = 'auto';
            elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 150) + 'px';
            sendTypingSignal();
        });

        elements.btnAttach.addEventListener('click', () => elements.fileInput.click());

        elements.fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) { await uploadAndSendFile(file); elements.fileInput.value = ''; }
        });

        elements.btnDeleteChat.addEventListener('click', () => showDeleteConfirmation());
        elements.btnInvite.addEventListener('click', showInviteModal);
        elements.soundToggle.addEventListener('click', toggleSound);

        elements.btnResume.addEventListener('click', () => {
            const saved = getSessionCookie();
            if (saved) {
                elements.joinSession.value = saved;
                elements.joinPassword.value = '';
                elements.btnJoinChat.disabled = true;
                updatePasswordStrength('', elements.pwStrengthJoin);
                showPage('join');
            }
        });

        elements.btnClearSession.addEventListener('click', () => {
            clearSessionCookie();
            elements.resumeSession.classList.add('hidden');
        });

        elements.messages.addEventListener('scroll', () => {
            const dist = elements.messages.scrollHeight - elements.messages.scrollTop - elements.messages.clientHeight;
            elements.scrollToBottomBtn.classList.toggle('visible', dist > 100);
        });

        elements.scrollToBottomBtn.addEventListener('click', scrollToBottom);

        elements.backButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-page');
                if (target === 'landing' && state.currentPage === 'chat') leaveChat();
                else showPage(target);
            });
        });

        document.addEventListener('visibilitychange', () => {
            if (state.currentPage === 'chat') {
                if (document.hidden) { stopPolling(); }
                else {
                    startPolling();
                    state.unreadCount = 0;
                    document.title = state.originalTitle;
                }
            }
        });
    }

    function validateJoinForm() {
        const sid = elements.joinSession.value.trim();
        const pw = elements.joinPassword.value;
        elements.btnJoinChat.disabled = !CypherCrypto.isValidSessionId(sid) || pw.length < 8;
    }

    function showPage(pageName) {
        Object.values(elements.pages).forEach(p => p.classList.remove('active'));
        if (elements.pages[pageName]) {
            elements.pages[pageName].classList.add('active');
            state.currentPage = pageName;
        }
    }

    function toggleTheme() {
        state.darkMode = !state.darkMode;
        document.documentElement.setAttribute('data-theme', state.darkMode ? 'dark' : 'light');
        localStorage.setItem('cypherbay-theme', state.darkMode ? 'dark' : 'light');
        updateThemeIcon();
    }

    function updateThemeIcon() {
        const svg = state.darkMode
            ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
            : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
        elements.themeToggle.innerHTML = svg;
    }

    function toggleSound() {
        state.soundEnabled = !state.soundEnabled;
        localStorage.setItem('cypherbay-sound', String(state.soundEnabled));
        updateSoundIcon();
        showToast(state.soundEnabled ? 'Sound enabled' : 'Sound disabled');
    }

    function updateSoundIcon() {
        const svg = state.soundEnabled
            ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>'
            : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
        elements.soundToggle.innerHTML = svg;
    }

    function updatePasswordStrength(pw, el) {
        if (!el) return;
        const s = getPasswordStrength(pw);
        el.className = 'password-strength ' + s.cls;
        el.querySelector('.strength-fill').style.width = (s.level / 3 * 100) + '%';
        el.querySelector('.strength-label').textContent = s.text;
    }

    function getPasswordStrength(pw) {
        if (!pw || pw.length < 8) return { level: 0, text: '', cls: '' };
        let score = 0;
        if (pw.length >= 8) score++;
        if (pw.length >= 12) score++;
        if (pw.length >= 16) score++;
        if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^a-zA-Z0-9]/.test(pw)) score++;
        if (score <= 2) return { level: 1, text: 'Weak', cls: 'strength-weak' };
        if (score <= 4) return { level: 2, text: 'Medium', cls: 'strength-medium' };
        return { level: 3, text: 'Strong', cls: 'strength-strong' };
    }

    function sessionUrl(sessionId) {
        return window.location.origin + window.location.pathname.replace(/\/$/, '') + '/#' + sessionId;
    }

    function renderQRCode(sessionId) {
        if (typeof QRCode !== 'undefined' && elements.qrCanvas) {
            try {
                QRCode.render(elements.qrCanvas, sessionUrl(sessionId));
                elements.qrCanvas.closest('.qr-container')?.classList.remove('hidden');
            } catch (err) {
                console.warn('QR generation failed (URL too long for QR encoder):', err);
                elements.qrCanvas.closest('.qr-container')?.classList.add('hidden');
            }
        }
    }

    async function enterChat(sessionId, password) {
        const isCreating = state.currentPage === 'create';
        const btn = isCreating ? elements.btnStartChat : elements.btnJoinChat;
        const originalText = btn.textContent;
        btn.textContent = 'Connecting...';
        btn.disabled = true;
        try {
            if (isCreating) {
                const createResp = await fetch('api/create.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId })
                });
                if (!createResp.ok) {
                    const d = await createResp.json().catch(() => ({}));
                    showToast(d.error || 'Could not create session.');
                    btn.textContent = originalText;
                    btn.disabled = false;
                    return;
                }
            }

            state.cryptoKey = await CypherCrypto.deriveKey(password, sessionId);
            state.sessionId = sessionId;
            state.password = password;
            state.lastMessageTimestamp = 0;
            state.sentMessageIds.clear();
            state.clientId = CypherCrypto.generateMessageId();
            state.unreadCount = 0;
            state.sessionStartTime = Date.now();
            state.pollErrorCount = 0;
            state.msgCount = 0;
            state.msgWindowStart = 0;

            elements.chatSessionId.textContent = sessionId;
            elements.messages.innerHTML = '';
            elements.messageInput.value = '';
            elements.messageInput.disabled = false;
            elements.btnSend.disabled = false;
            elements.btnAttach.disabled = false;
            elements.typingIndicator.classList.add('hidden');
            elements.scrollToBottomBtn.classList.remove('visible');
            updateMsgRateCounter();

            if (elements.rememberSession && elements.rememberSession.checked) {
                setSessionCookie(sessionId);
                checkResumeCookie();
            }

            showPage('chat');
            addSystemMessage('Chat joined. All messages are end-to-end encrypted.');
            startPolling();
            startSessionTimer();
            updateConnectionStatus(true);
            elements.messageInput.focus();
        } catch (error) {
            btn.textContent = originalText;
            btn.disabled = false;
            showToast('Error connecting. Try again.');
        }
    }

    function leaveChat() {
        stopPolling();
        stopSessionTimer();
        state.sessionId = null;
        state.password = null;
        state.cryptoKey = null;
        state.clientId = null;
        state.lastMessageTimestamp = 0;
        state.sentMessageIds.clear();
        state.connected = false;
        state.unreadCount = 0;
        document.title = state.originalTitle;
        elements.messageInput.disabled = true;
        elements.btnSend.disabled = true;
        elements.btnAttach.disabled = true;
        showPage('landing');
    }

    function startSessionTimer() {
        updateSessionTimer();
        state.sessionTimer = setInterval(updateSessionTimer, 1000);
    }

    function stopSessionTimer() {
        if (state.sessionTimer) { clearInterval(state.sessionTimer); state.sessionTimer = null; }
    }

    function updateSessionTimer() {
        if (!state.sessionStartTime || !elements.sessionTimerEl) return;
        const remaining = Math.max(0, SESSION_DURATION - (Date.now() - state.sessionStartTime));
        const m = Math.floor(remaining / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        elements.sessionTimerEl.textContent = m + ':' + String(s).padStart(2, '0');
        elements.sessionTimerEl.classList.toggle('timer-warning', remaining <= 300000);
        if (remaining <= 0) {
            addSystemMessage('Session expired.');
            leaveChat();
        }
    }

    async function sendTypingSignal() {
        if (!state.cryptoKey || !state.sessionId) return;
        const now = Date.now();
        if (now - state.lastTypingSent < TYPING_INTERVAL) return;
        state.lastTypingSent = now;
        try {
            const payload = await CypherCrypto.encrypt(
                JSON.stringify({ clientId: state.clientId, t: now }), state.cryptoKey
            );
            fetch('api/send.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: state.sessionId, typing: payload })
            });
        } catch (e) {}
    }

    async function sendMessage() {
        const text = elements.messageInput.value.trim();
        if (!text || !state.cryptoKey || !state.sessionId) return;

        const now = Date.now();
        if (state.msgWindowStart && now - state.msgWindowStart >= 60000) {
            state.msgCount = 0;
            state.msgWindowStart = 0;
        }

        try {
            const messageId = CypherCrypto.generateMessageId();
            const messageData = {
                id: messageId,
                alias: state.localAlias,
                text: text,
                timestamp: now
            };
            const encrypted = await CypherCrypto.encrypt(JSON.stringify(messageData), state.cryptoKey);
            state.sentMessageIds.add(messageId);
            const response = await fetch('api/send.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: state.sessionId, payload: encrypted })
            });
            if (response.ok) {
                if (!state.msgWindowStart) state.msgWindowStart = now;
                state.msgCount++;
                updateMsgRateCounter();
                displayMessage(messageData, true);
                elements.messageInput.value = '';
                elements.messageInput.style.height = 'auto';
            } else if (response.status === 429) {
                showToast('Rate limit — wait a moment');
            } else {
                addSystemMessage('Message could not be sent.');
            }
        } catch (error) {
            addSystemMessage('Error sending message.');
        }
    }

    function updateMsgRateCounter() {
        const el = elements.msgRateCounter;
        if (!el) return;
        const now = Date.now();
        if (state.msgWindowStart && now - state.msgWindowStart >= 60000) {
            state.msgCount = 0;
            state.msgWindowStart = 0;
        }
        const remaining = MSG_LIMIT - state.msgCount;
        el.textContent = remaining + '/' + MSG_LIMIT;
        el.className = 'msg-rate-counter' +
            (remaining <= 10 ? ' counter-warn' : '') +
            (remaining <= 3 ? ' counter-danger' : '');
    }

    async function fetchAndDecryptBlob(url) {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Download failed (HTTP ' + resp.status + ')');
        const buffer = await resp.arrayBuffer();
        if (buffer.byteLength < 13) throw new Error('Invalid encrypted file');
        const iv = new Uint8Array(buffer, 0, 12);
        const ciphertext = buffer.slice(12);
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, state.cryptoKey, ciphertext);
    }

    async function uploadAndSendFile(file) {
        if (file.size > 25 * 1024 * 1024) {
            addSystemMessage('File too large. Max 25 MB.');
            return;
        }
        try {
            elements.uploadProgress.classList.remove('hidden');
            elements.btnAttach.disabled = true;

            // шифруем файл на клиенте перед загрузкой — сервер хранит только непрозрачный blob
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ciphertext = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                state.cryptoKey,
                await file.arrayBuffer()
            );
            const encryptedBlob = new Blob([iv.buffer, ciphertext]);

            const formData = new FormData();
            formData.append('file', encryptedBlob, 'encrypted.bin');
            const response = await fetch('api/upload.php', { method: 'POST', body: formData });
            let result;
            try { result = await response.json(); } catch (e) { throw new Error('Server returned invalid response'); }
            if (!response.ok) throw new Error(result.error || 'Upload failed (HTTP ' + response.status + ')');
            if (!result.success || !result.url) throw new Error(result.error || 'Upload failed');

            const messageId = CypherCrypto.generateMessageId();
            const messageData = {
                id: messageId,
                alias: state.localAlias,
                type: 'file',
                fileType: getFileType(file.type),
                mimeType: file.type || 'application/octet-stream',
                fileName: file.name,
                fileSize: file.size,
                url: result.url,
                timestamp: Date.now()
            };
            const encrypted = await CypherCrypto.encrypt(JSON.stringify(messageData), state.cryptoKey);
            state.sentMessageIds.add(messageId);
            const sendResp = await fetch('api/send.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: state.sessionId, payload: encrypted })
            });
            if (sendResp.ok) displayMessage(messageData, true);
            else addSystemMessage('File uploaded but could not send the message.');
        } catch (error) {
            addSystemMessage('Upload failed: ' + error.message);
        } finally {
            elements.uploadProgress.classList.add('hidden');
            elements.btnAttach.disabled = false;
        }
    }

    function getFileType(mime) {
        if (mime.startsWith('image/')) return 'image';
        if (mime.startsWith('video/')) return 'video';
        if (mime.startsWith('audio/')) return 'audio';
        return 'file';
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function isSafeUrl(url) {
        try { const p = new URL(url); return p.protocol === 'https:' || p.protocol === 'http:'; }
        catch { return false; }
    }

    function startPolling() {
        if (state.pollingInterval) return;
        fetchMessages();
        state.pollingInterval = setInterval(() => {
            if (state.pollErrorCount > 3) {
                if (state.pollErrorCount % 3 !== 0) return;
            }
            fetchMessages();
        }, POLL_INTERVAL);
    }

    function stopPolling() {
        if (state.pollingInterval) { clearInterval(state.pollingInterval); state.pollingInterval = null; }
    }

    async function fetchMessages() {
        if (!state.sessionId || !state.cryptoKey) return;
        try {
            const resp = await fetch('api/messages.php?sessionId=' + encodeURIComponent(state.sessionId) + '&since=' + state.lastMessageTimestamp);
            if (resp.status === 404) {
                stopPolling();
                addSystemMessage('Session not found. It may have expired or never existed.');
                leaveChat();
                return;
            }
            if (!resp.ok) { updateConnectionStatus(false); state.pollErrorCount++; return; }
            state.pollErrorCount = 0;
            updateConnectionStatus(true);
            const data = await resp.json();
            if (data.messages && data.messages.length > 0) {
                for (const msg of data.messages) await processMessage(msg);
            }
            if (data.typing) await processTyping(data.typing);
            else elements.typingIndicator.classList.add('hidden');
        } catch (error) {
            updateConnectionStatus(false);
            state.pollErrorCount++;
        }
    }

    async function processTyping(typing) {
        try {
            const dec = await CypherCrypto.decrypt(typing.payload, state.cryptoKey);
            if (dec) {
                const d = JSON.parse(dec);
                if (d.clientId !== state.clientId && (Date.now() - typing.timestamp) < TYPING_DISPLAY_TIMEOUT) {
                    elements.typingIndicator.classList.remove('hidden');
                    return;
                }
            }
        } catch (e) {}
        elements.typingIndicator.classList.add('hidden');
    }

    async function processMessage(msg) {
        try {
            if (msg.timestamp > state.lastMessageTimestamp) state.lastMessageTimestamp = msg.timestamp;
            const dec = await CypherCrypto.decrypt(msg.payload, state.cryptoKey);
            if (dec) {
                const messageData = JSON.parse(dec);
                if (state.sentMessageIds.has(messageData.id)) return;
                displayMessage(messageData, false);
                if (state.soundEnabled) playNotificationSound();
                if (document.hidden) {
                    state.unreadCount++;
                    document.title = '(' + state.unreadCount + ') ' + state.originalTitle;
                }
            } else {
                displayEncryptionError(msg.timestamp);
            }
        } catch (error) {
            displayEncryptionError(msg.timestamp);
        }
    }

    function displayMessage(messageData, isSent) {
        const el = document.createElement('div');
        el.className = 'message ' + (isSent ? 'sent' : 'received') + ' message-appear';

        const content = document.createElement('div');
        content.className = 'message-content';
        if (messageData.type === 'file') content.appendChild(createFileContent(messageData));
        else content.textContent = messageData.text;

        const meta = document.createElement('div');
        meta.className = 'message-meta';

        const alias = document.createElement('span');
        alias.className = 'message-alias';
        alias.textContent = isSent ? state.localAlias : (messageData.alias || 'Anonymous');
        meta.appendChild(alias);

        const time = document.createElement('span');
        time.textContent = formatTime(messageData.timestamp);
        meta.appendChild(time);

        el.appendChild(content);
        el.appendChild(meta);
        elements.messages.appendChild(el);
        scrollToBottom(isSent);
    }

    function createFileContent(messageData) {
        const container = document.createElement('div');
        container.className = 'file-content';
        const safeUrl = isSafeUrl(messageData.url) ? messageData.url : '';
        const mimeType = messageData.mimeType || 'application/octet-stream';

        if (messageData.fileType === 'image') {
            const wrap = document.createElement('div');
            wrap.className = 'img-wrap img-loading';
            const img = document.createElement('img');
            img.alt = messageData.fileName;
            img.className = 'message-image';
            wrap.appendChild(img);
            if (safeUrl) {
                fetchAndDecryptBlob(safeUrl).then(decrypted => {
                    const objUrl = URL.createObjectURL(new Blob([decrypted], { type: mimeType }));
                    img.addEventListener('load', () => wrap.classList.remove('img-loading'));
                    img.addEventListener('error', () => {
                        wrap.classList.remove('img-loading');
                        img.alt = '[Image failed]';
                    });
                    img.addEventListener('click', () => window.open(objUrl, '_blank'));
                    img.src = objUrl;
                }).catch(() => {
                    wrap.classList.remove('img-loading');
                    img.alt = '[Decryption failed]';
                });
            } else {
                wrap.classList.remove('img-loading');
            }
            container.appendChild(wrap);
        } else if (messageData.fileType === 'video') {
            const video = document.createElement('video');
            video.controls = true;
            video.className = 'message-video';
            video.preload = 'none';
            if (safeUrl) {
                fetchAndDecryptBlob(safeUrl).then(decrypted => {
                    const objUrl = URL.createObjectURL(new Blob([decrypted], { type: mimeType }));
                    video.src = objUrl;
                }).catch(() => { video.remove(); container.appendChild(makeErrorSpan('Decryption failed')); });
            }
            container.appendChild(video);
        } else if (messageData.fileType === 'audio') {
            const audio = document.createElement('audio');
            audio.controls = true;
            audio.className = 'message-audio';
            if (safeUrl) {
                fetchAndDecryptBlob(safeUrl).then(decrypted => {
                    const objUrl = URL.createObjectURL(new Blob([decrypted], { type: mimeType }));
                    audio.src = objUrl;
                }).catch(() => { audio.remove(); container.appendChild(makeErrorSpan('Decryption failed')); });
            }
            container.appendChild(audio);
        } else {
            const btn = document.createElement('button');
            btn.className = 'file-link';
            btn.type = 'button';
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '20'); svg.setAttribute('height', '20');
            svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
            const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            p.setAttribute('d', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z');
            const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            pl.setAttribute('points', '14,2 14,8 20,8');
            svg.appendChild(p); svg.appendChild(pl);
            const info = document.createElement('span'); info.className = 'file-info';
            const nameEl = document.createElement('span'); nameEl.className = 'file-name';
            nameEl.textContent = messageData.fileName;
            const sizeEl = document.createElement('span'); sizeEl.className = 'file-size';
            sizeEl.textContent = formatFileSize(messageData.fileSize);
            info.appendChild(nameEl); info.appendChild(sizeEl);
            btn.appendChild(svg); btn.appendChild(info);
            if (safeUrl) {
                btn.addEventListener('click', async () => {
                    btn.disabled = true;
                    const prevText = nameEl.textContent;
                    nameEl.textContent = 'Decrypting…';
                    try {
                        const decrypted = await fetchAndDecryptBlob(safeUrl);
                        const objUrl = URL.createObjectURL(new Blob([decrypted], { type: mimeType }));
                        const a = document.createElement('a');
                        a.href = objUrl;
                        a.download = messageData.fileName;
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
                    } catch (e) {
                        addSystemMessage('Could not decrypt file.');
                    } finally {
                        btn.disabled = false;
                        nameEl.textContent = prevText;
                    }
                });
            }
            container.appendChild(btn);
        }
        return container;
    }

    function makeErrorSpan(text) {
        const s = document.createElement('span');
        s.className = 'file-size';
        s.textContent = '[' + text + ']';
        return s;
    }

    function displayEncryptionError(timestamp) {
        const el = document.createElement('div');
        el.className = 'message received message-appear';
        const content = document.createElement('div');
        content.className = 'message-content message-error';
        content.textContent = '[Message could not be decrypted - wrong password?]';
        const meta = document.createElement('div');
        meta.className = 'message-meta';
        meta.textContent = formatTime(timestamp);
        el.appendChild(content); el.appendChild(meta);
        elements.messages.appendChild(el);
        scrollToBottom();
    }

    function addSystemMessage(text) {
        const el = document.createElement('div');
        el.className = 'system-message message-appear';
        el.textContent = text;
        elements.messages.appendChild(el);
        scrollToBottom(true);
    }

    function updateConnectionStatus(connected) {
        state.connected = connected;
        elements.connectionStatus.classList.remove('connected', 'disconnected');
        if (connected) {
            elements.connectionStatus.classList.add('connected');
            elements.connectionStatus.querySelector('.status-text').textContent = 'Connected';
        } else {
            elements.connectionStatus.classList.add('disconnected');
            elements.connectionStatus.querySelector('.status-text').textContent = 'Disconnected';
        }
    }

    let _audioCtx = null;
    function _getAudioCtx() {
        if (!_audioCtx) {
            try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
        }
        return _audioCtx;
    }

    function playNotificationSound() {
        try {
            const ctx = _getAudioCtx();
            if (!ctx) return;
            const play = () => {
                const t = ctx.currentTime;

                const o1 = ctx.createOscillator();
                const g1 = ctx.createGain();
                o1.connect(g1); g1.connect(ctx.destination);
                o1.type = 'sine';
                o1.frequency.setValueAtTime(880, t);
                g1.gain.setValueAtTime(0.25, t);
                g1.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
                o1.start(t); o1.stop(t + 0.18);

                const o2 = ctx.createOscillator();
                const g2 = ctx.createGain();
                o2.connect(g2); g2.connect(ctx.destination);
                o2.type = 'sine';
                o2.frequency.setValueAtTime(1100, t + 0.16);
                g2.gain.setValueAtTime(0, t);
                g2.gain.setValueAtTime(0.22, t + 0.16);
                g2.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
                o2.start(t); o2.stop(t + 0.38);
            };
            if (ctx.state === 'suspended') ctx.resume().then(play);
            else play();
        } catch(e) {}
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied!');
        } catch (error) {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta);
            showToast('Copied!');
        }
    }

    function showToast(message) {
        let toast = document.querySelector('.toast');
        if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast); }
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    }

    function showDeleteConfirmation() {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = '<div class="modal-header"><span class="modal-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></span><h3>Delete Chat</h3></div><div class="modal-body"><p class="modal-text">This will permanently delete all messages in this chat session.</p><div class="form-group"><label for="delete-password">Enter chat password to confirm:</label><input type="password" id="delete-password" placeholder="Password" autocomplete="off"></div><p class="modal-error hidden" id="delete-error"></p></div><div class="modal-actions"><button class="btn-secondary modal-cancel">Cancel</button><button class="btn-danger modal-delete">Delete Chat</button></div>';
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            const pwInput = modal.querySelector('#delete-password');
            const errEl = modal.querySelector('#delete-error');
            const delBtn = modal.querySelector('.modal-delete');
            requestAnimationFrame(() => { overlay.classList.add('show'); pwInput.focus(); });
            const cleanup = () => { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 200); resolve(); };
            const attemptDelete = async () => {
                const pw = pwInput.value;
                if (!pw) { errEl.textContent = 'Please enter the password'; errEl.classList.remove('hidden'); return; }
                if (pw !== state.password) { errEl.textContent = 'Incorrect password'; errEl.classList.remove('hidden'); pwInput.value = ''; return; }
                delBtn.disabled = true; delBtn.textContent = 'Deleting...';
                try {
                    const resp = await fetch('api/delete.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sessionId: state.sessionId })
                    });
                    if (resp.ok) { cleanup(); leaveChat(); showToast('Chat deleted'); }
                    else { errEl.textContent = 'Failed to delete chat'; errEl.classList.remove('hidden'); delBtn.disabled = false; delBtn.textContent = 'Delete Chat'; }
                } catch (e) { errEl.textContent = 'Error deleting chat'; errEl.classList.remove('hidden'); delBtn.disabled = false; delBtn.textContent = 'Delete Chat'; }
            };
            modal.querySelector('.modal-cancel').addEventListener('click', cleanup);
            delBtn.addEventListener('click', attemptDelete);
            pwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptDelete(); });
            overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
        });
    }

    function setSessionCookie(sessionId) {
        const secure = location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = 'cypherbay_session=' + encodeURIComponent(sessionId) + '; Max-Age=3600; SameSite=Strict; path=/' + secure;
    }

    function getSessionCookie() {
        const match = document.cookie.match(/(?:^|;\s*)cypherbay_session=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : null;
    }

    function clearSessionCookie() {
        document.cookie = 'cypherbay_session=; Max-Age=0; SameSite=Strict; path=/';
    }

    function checkResumeCookie() {
        const saved = getSessionCookie();
        if (saved && CypherCrypto.isValidSessionId(saved)) {
            elements.resumeSessionId.textContent = saved;
            elements.resumeSession.classList.remove('hidden');
        } else {
            elements.resumeSession.classList.add('hidden');
        }
    }

    function showInviteModal() {
        const sessionId = state.sessionId;
        const joinUrl = sessionUrl(sessionId);

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        const modal = document.createElement('div');
        modal.className = 'modal modal-invite';
        modal.innerHTML =
            '<div class="modal-header">' +
                '<span class="modal-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></span>' +
                '<h3>Invite</h3>' +
            '</div>' +
            '<div class="modal-body">' +
                '<div class="invite-qr-wrap">' +
                    '<canvas id="invite-qr-canvas"></canvas>' +
                    '<p class="qr-label">Scan to join</p>' +
                '</div>' +
                '<div class="invite-field">' +
                    '<span class="invite-field-label">Link</span>' +
                    '<div class="invite-field-row">' +
                        '<input type="text" class="invite-input" id="invite-link-val" readonly value="">' +
                        '<button class="btn-icon invite-copy" data-copy="link" title="Copy link"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>' +
                    '</div>' +
                '</div>' +
                '<div class="invite-field">' +
                    '<span class="invite-field-label">Session ID</span>' +
                    '<div class="invite-field-row">' +
                        '<input type="text" class="invite-input" id="invite-id-val" readonly value="">' +
                        '<button class="btn-icon invite-copy" data-copy="id" title="Copy ID"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>' +
                    '</div>' +
                '</div>' +
                '<p class="hint" style="margin-top:0.75rem">Share the password through a separate channel.</p>' +
            '</div>' +
            '<div class="modal-actions"><button class="btn-secondary modal-cancel">Close</button></div>';

        modal.querySelector('#invite-link-val').value = joinUrl;
        modal.querySelector('#invite-id-val').value = sessionId;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('show'));

        if (typeof QRCode !== 'undefined') {
            try {
                QRCode.render(modal.querySelector('#invite-qr-canvas'), joinUrl);
            } catch (err) {
                console.warn('QR generation failed (URL too long for QR encoder):', err);
                modal.querySelector('.invite-qr-wrap')?.classList.add('hidden');
            }
        }

        modal.querySelectorAll('.invite-copy').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.dataset.copy === 'link' ? joinUrl : sessionId;
                copyToClipboard(val);
            });
        });

        const close = () => { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 200); };
        modal.querySelector('.modal-cancel').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    }

    function formatTime(ts) {
        return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    function scrollToBottom(force = false) {
        const m = elements.messages;
        const dist = m.scrollHeight - m.scrollTop - m.clientHeight;
        if (force || dist < 120) {
            m.scrollTop = m.scrollHeight;
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
