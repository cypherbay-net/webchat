(function() {
    'use strict';

    const state = {
        currentPage: 'landing',
        sessionId: null,
        password: null,
        cryptoKey: null,
        localAlias: 'Anonymous',
        pollingInterval: null,
        lastMessageTimestamp: 0,
        sentMessageIds: new Set(),
        connected: false
    };

    const elements = {};
    const POLL_INTERVAL = 1000;

    function init() {
        cacheElements();
        bindEvents();
        showPage('landing');
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

        elements.sessionId = document.getElementById('session-id');
        elements.copySession = document.getElementById('copy-session');
        elements.regenerateSession = document.getElementById('regenerate-session');
        elements.createPassword = document.getElementById('create-password');
        elements.btnStartChat = document.getElementById('btn-start-chat');

        elements.joinSession = document.getElementById('join-session');
        elements.joinPassword = document.getElementById('join-password');
        elements.btnJoinChat = document.getElementById('btn-join-chat');

        elements.btnLeaveChat = document.getElementById('btn-leave-chat');
        elements.chatSessionId = document.getElementById('chat-session-id');
        elements.connectionStatus = document.getElementById('connection-status');
        elements.messages = document.getElementById('messages');
        elements.localAlias = document.getElementById('local-alias');
        elements.messageForm = document.getElementById('message-form');
        elements.messageInput = document.getElementById('message-input');
        elements.btnSend = document.getElementById('btn-send');
        elements.fileInput = document.getElementById('file-input');
        elements.btnAttach = document.getElementById('btn-attach');
        elements.uploadProgress = document.getElementById('upload-progress');
        elements.btnDeleteChat = document.getElementById('btn-delete-chat');

        elements.backButtons = document.querySelectorAll('.btn-back');
    }

    function bindEvents() {
        elements.btnCreate.addEventListener('click', () => {
            elements.sessionId.value = CypherCrypto.generateSessionId();
            elements.createPassword.value = '';
            elements.btnStartChat.disabled = true;
            showPage('create');
        });

        elements.btnJoin.addEventListener('click', () => {
            elements.joinSession.value = '';
            elements.joinPassword.value = '';
            elements.btnJoinChat.disabled = true;
            showPage('join');
        });

        elements.copySession.addEventListener('click', () => {
            copyToClipboard(elements.sessionId.value);
        });

        elements.regenerateSession.addEventListener('click', () => {
            elements.sessionId.value = CypherCrypto.generateSessionId();
        });

        elements.createPassword.addEventListener('input', () => {
            elements.btnStartChat.disabled = elements.createPassword.value.length < 8;
        });

        elements.btnStartChat.addEventListener('click', async () => {
            const sessionId = elements.sessionId.value;
            const password = elements.createPassword.value;
            
            if (sessionId && password) {
                await enterChat(sessionId, password);
            }
        });

        const validateJoinForm = () => {
            const sessionId = elements.joinSession.value.trim();
            const password = elements.joinPassword.value;
            elements.btnJoinChat.disabled = !CypherCrypto.isValidSessionId(sessionId) || password.length < 8;
        };

        elements.joinSession.addEventListener('input', validateJoinForm);
        elements.joinPassword.addEventListener('input', validateJoinForm);

        elements.btnJoinChat.addEventListener('click', async () => {
            const sessionId = elements.joinSession.value.trim();
            const password = elements.joinPassword.value;
            
            if (CypherCrypto.isValidSessionId(sessionId) && password) {
                await enterChat(sessionId, password);
            }
        });

        elements.btnLeaveChat.addEventListener('click', () => {
            leaveChat();
        });

        elements.localAlias.addEventListener('input', () => {
            state.localAlias = elements.localAlias.value.trim() || 'Anonym';
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
        });

        elements.btnAttach.addEventListener('click', () => {
            elements.fileInput.click();
        });

        elements.fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await uploadAndSendFile(file);
                elements.fileInput.value = '';
            }
        });

        elements.btnDeleteChat.addEventListener('click', async () => {
            await showDeleteConfirmation();
        });

        elements.backButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetPage = btn.getAttribute('data-page');
                if (targetPage === 'landing' && state.currentPage === 'chat') {
                    leaveChat();
                } else {
                    showPage(targetPage);
                }
            });
        });

        document.addEventListener('visibilitychange', () => {
            if (state.currentPage === 'chat') {
                if (document.hidden) {
                    stopPolling();
                } else {
                    startPolling();
                }
            }
        });
    }

    function showPage(pageName) {
        Object.values(elements.pages).forEach(page => {
            page.classList.remove('active');
        });
        
        if (elements.pages[pageName]) {
            elements.pages[pageName].classList.add('active');
            state.currentPage = pageName;
        }
    }

    async function enterChat(sessionId, password) {
        try {
            state.cryptoKey = await CypherCrypto.deriveKey(password, sessionId);
            state.sessionId = sessionId;
            state.password = password;
            state.lastMessageTimestamp = 0;
            state.sentMessageIds.clear();

            elements.chatSessionId.textContent = sessionId;
            elements.messages.innerHTML = '';
            elements.messageInput.value = '';
            elements.messageInput.disabled = false;
            elements.btnSend.disabled = false;
            elements.btnAttach.disabled = false;

            showPage('chat');

            addSystemMessage('Chat joined. All messages are encrypted.');

            startPolling();
            updateConnectionStatus(true);

        } catch (error) {
            console.error('Failed to enter chat:', error);
            addSystemMessage('Error entering chat.');
        }
    }

    function leaveChat() {
        stopPolling();
        state.sessionId = null;
        state.password = null;
        state.cryptoKey = null;
        state.lastMessageTimestamp = 0;
        state.sentMessageIds.clear();
        state.connected = false;

        elements.messageInput.disabled = true;
        elements.btnSend.disabled = true;
        elements.btnAttach.disabled = true;

        showPage('landing');
    }

    async function sendMessage() {
        const text = elements.messageInput.value.trim();
        
        if (!text || !state.cryptoKey || !state.sessionId) {
            return;
        }

        try {
            const messageId = CypherCrypto.generateMessageId();
            
            const messageData = {
                id: messageId,
                text: text,
                timestamp: Date.now()
            };

            const encryptedPayload = await CypherCrypto.encrypt(JSON.stringify(messageData), state.cryptoKey);

            state.sentMessageIds.add(messageId);

            const response = await fetch('api/send.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: state.sessionId,
                    payload: encryptedPayload
                })
            });

            if (response.ok) {
                displayMessage(messageData, true);
                elements.messageInput.value = '';
                elements.messageInput.style.height = 'auto';
            } else {
                addSystemMessage('Message could not be sent.');
            }

        } catch (error) {
            console.error('Failed to send message:', error);
            addSystemMessage('Error sending message.');
        }
    }

    async function uploadAndSendFile(file) {
        const maxSize = 100 * 1024 * 1024;
        if (file.size > maxSize) {
            addSystemMessage('File too large. Max 100MB.');
            return;
        }

        const confirmed = await showUploadWarning(file.name);

        if (!confirmed) {
            return;
        }

        try {
            elements.uploadProgress.classList.remove('hidden');
            elements.btnAttach.disabled = true;

            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('api/upload.php', {
                method: 'POST',
                body: formData
            });

            const responseText = await response.text();

            if (!response.ok) {
                throw new Error('Upload failed: ' + responseText);
            }

            let result;
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                throw new Error('Invalid JSON: ' + responseText);
            }

            if (!result.success || !result.url) {
                throw new Error(result.error || 'Upload failed');
            }

            const trimmedUrl = result.url;

            const messageId = CypherCrypto.generateMessageId();
            const fileType = getFileType(file.type);

            const messageData = {
                id: messageId,
                type: 'file',
                fileType: fileType,
                fileName: file.name,
                fileSize: file.size,
                url: trimmedUrl,
                timestamp: Date.now()
            };

            const encryptedPayload = await CypherCrypto.encrypt(JSON.stringify(messageData), state.cryptoKey);
            state.sentMessageIds.add(messageId);

            const sendResponse = await fetch('api/send.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: state.sessionId,
                    payload: encryptedPayload
                })
            });

            if (sendResponse.ok) {
                displayMessage(messageData, true);
            } else {
                addSystemMessage('Could not send file message.');
            }

        } catch (error) {
            console.error('Upload failed:', error);
            addSystemMessage('File upload failed.');
        } finally {
            elements.uploadProgress.classList.add('hidden');
            elements.btnAttach.disabled = false;
        }
    }

    function getFileType(mimeType) {
        if (mimeType.startsWith('image/')) return 'image';
        if (mimeType.startsWith('video/')) return 'video';
        if (mimeType.startsWith('audio/')) return 'audio';
        return 'file';
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function startPolling() {
        if (state.pollingInterval) {
            return;
        }

        fetchMessages();

        state.pollingInterval = setInterval(fetchMessages, POLL_INTERVAL);
    }

    function stopPolling() {
        if (state.pollingInterval) {
            clearInterval(state.pollingInterval);
            state.pollingInterval = null;
        }
    }

    async function fetchMessages() {
        if (!state.sessionId || !state.cryptoKey) {
            return;
        }

        try {
            const response = await fetch(`api/messages.php?sessionId=${encodeURIComponent(state.sessionId)}&since=${state.lastMessageTimestamp}`);
            
            if (!response.ok) {
                updateConnectionStatus(false);
                return;
            }

            updateConnectionStatus(true);

            const data = await response.json();
            
            if (data.messages && data.messages.length > 0) {
                for (const msg of data.messages) {
                    await processMessage(msg);
                }
            }

        } catch (error) {
            console.error('Failed to fetch messages:', error);
            updateConnectionStatus(false);
        }
    }

    async function processMessage(msg) {
        try {
            if (msg.timestamp > state.lastMessageTimestamp) {
                state.lastMessageTimestamp = msg.timestamp;
            }

            const decrypted = await CypherCrypto.decrypt(msg.payload, state.cryptoKey);
            
            if (decrypted) {
                const messageData = JSON.parse(decrypted);
                
                if (state.sentMessageIds.has(messageData.id)) {
                    return;
                }

                displayMessage(messageData, false);
            } else {
                displayEncryptionError(msg.timestamp);
            }

        } catch (error) {
            displayEncryptionError(msg.timestamp);
        }
    }

    function displayMessage(messageData, isSent) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${isSent ? 'sent' : 'received'}`;

        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';

        if (messageData.type === 'file') {
            contentEl.appendChild(createFileContent(messageData));
        } else {
            contentEl.textContent = messageData.text;
        }

        const metaEl = document.createElement('div');
        metaEl.className = 'message-meta';
        
        const timeEl = document.createElement('span');
        timeEl.textContent = formatTime(messageData.timestamp);
        
        metaEl.appendChild(timeEl);

        if (isSent) {
            const aliasEl = document.createElement('span');
            aliasEl.textContent = state.localAlias;
            metaEl.insertBefore(aliasEl, timeEl);
        }

        messageEl.appendChild(contentEl);
        messageEl.appendChild(metaEl);

        elements.messages.appendChild(messageEl);
        scrollToBottom();
    }

    function createFileContent(messageData) {
        const container = document.createElement('div');
        container.className = 'file-content';

        if (messageData.fileType === 'image') {
            const img = document.createElement('img');
            img.src = messageData.url;
            img.alt = messageData.fileName;
            img.className = 'message-image';
            img.loading = 'lazy';
            img.addEventListener('click', () => window.open(messageData.url, '_blank'));
            container.appendChild(img);
        } else if (messageData.fileType === 'video') {
            const video = document.createElement('video');
            video.src = messageData.url;
            video.controls = true;
            video.className = 'message-video';
            video.preload = 'metadata';
            container.appendChild(video);
        } else if (messageData.fileType === 'audio') {
            const audio = document.createElement('audio');
            audio.src = messageData.url;
            audio.controls = true;
            audio.className = 'message-audio';
            container.appendChild(audio);
        } else {
            const fileLink = document.createElement('a');
            fileLink.href = messageData.url;
            fileLink.target = '_blank';
            fileLink.rel = 'noopener';
            fileLink.className = 'file-link';
            fileLink.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                </svg>
                <span class="file-info">
                    <span class="file-name">${messageData.fileName}</span>
                    <span class="file-size">${formatFileSize(messageData.fileSize)}</span>
                </span>
            `;
            container.appendChild(fileLink);
        }

        return container;
    }

    function displayEncryptionError(timestamp) {
        const messageEl = document.createElement('div');
        messageEl.className = 'message received';

        const contentEl = document.createElement('div');
        contentEl.className = 'message-content message-error';
        contentEl.textContent = '[Message could not be decrypted - wrong password?]';

        const metaEl = document.createElement('div');
        metaEl.className = 'message-meta';
        metaEl.textContent = formatTime(timestamp);

        messageEl.appendChild(contentEl);
        messageEl.appendChild(metaEl);

        elements.messages.appendChild(messageEl);
        scrollToBottom();
    }

    function addSystemMessage(text) {
        const messageEl = document.createElement('div');
        messageEl.className = 'system-message';
        messageEl.textContent = text;
        elements.messages.appendChild(messageEl);
        scrollToBottom();
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

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied!');
        } catch (error) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('Copied!');
        }
    }

    function showToast(message) {
        let toast = document.querySelector('.toast');
        
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 2000);
    }

    function showUploadWarning(fileName) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-header">
                    <span class="modal-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/>
                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                    </span>
                    <h3>File Upload Warning</h3>
                </div>
                <div class="modal-body">
                    <p class="modal-filename">${fileName}</p>
                    <ul class="modal-warnings">
                        <li>The file will be uploaded to an external server (0x0.st)</li>
                        <li>The file itself is <strong>NOT encrypted</strong></li>
                        <li>Only the link in the chat is encrypted</li>
                        <li>Anyone with the link can access the file</li>
                    </ul>
                </div>
                <div class="modal-actions">
                    <button class="btn-secondary modal-cancel">Cancel</button>
                    <button class="btn-primary modal-confirm">Upload</button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            requestAnimationFrame(() => {
                overlay.classList.add('show');
            });

            const cleanup = (result) => {
                overlay.classList.remove('show');
                setTimeout(() => {
                    overlay.remove();
                }, 200);
                resolve(result);
            };

            modal.querySelector('.modal-cancel').addEventListener('click', () => cleanup(false));
            modal.querySelector('.modal-confirm').addEventListener('click', () => cleanup(true));
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) cleanup(false);
            });
        });
    }

    function showDeleteConfirmation() {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-header">
                    <span class="modal-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3,6 5,6 21,6"/>
                            <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"/>
                            <line x1="10" y1="11" x2="10" y2="17"/>
                            <line x1="14" y1="11" x2="14" y2="17"/>
                        </svg>
                    </span>
                    <h3>Delete Chat</h3>
                </div>
                <div class="modal-body">
                    <p class="modal-text">This will permanently delete all messages in this chat session.</p>
                    <div class="form-group">
                        <label for="delete-password">Enter chat password to confirm:</label>
                        <input type="password" id="delete-password" placeholder="Password" autocomplete="off">
                    </div>
                    <p class="modal-error hidden" id="delete-error"></p>
                </div>
                <div class="modal-actions">
                    <button class="btn-secondary modal-cancel">Cancel</button>
                    <button class="btn-danger modal-delete">Delete Chat</button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            const passwordInput = modal.querySelector('#delete-password');
            const errorEl = modal.querySelector('#delete-error');
            const deleteBtn = modal.querySelector('.modal-delete');

            requestAnimationFrame(() => {
                overlay.classList.add('show');
                passwordInput.focus();
            });

            const cleanup = () => {
                overlay.classList.remove('show');
                setTimeout(() => {
                    overlay.remove();
                }, 200);
                resolve();
            };

            const attemptDelete = async () => {
                const enteredPassword = passwordInput.value;
                
                if (!enteredPassword) {
                    errorEl.textContent = 'Please enter the password';
                    errorEl.classList.remove('hidden');
                    return;
                }

                if (enteredPassword !== state.password) {
                    errorEl.textContent = 'Incorrect password';
                    errorEl.classList.remove('hidden');
                    passwordInput.value = '';
                    return;
                }

                deleteBtn.disabled = true;
                deleteBtn.textContent = 'Deleting...';

                try {
                    const response = await fetch('api/delete.php', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            sessionId: state.sessionId
                        })
                    });

                    if (response.ok) {
                        cleanup();
                        leaveChat();
                        showToast('Chat deleted');
                    } else {
                        errorEl.textContent = 'Failed to delete chat';
                        errorEl.classList.remove('hidden');
                        deleteBtn.disabled = false;
                        deleteBtn.textContent = 'Delete Chat';
                    }
                } catch (error) {
                    errorEl.textContent = 'Error deleting chat';
                    errorEl.classList.remove('hidden');
                    deleteBtn.disabled = false;
                    deleteBtn.textContent = 'Delete Chat';
                }
            };

            modal.querySelector('.modal-cancel').addEventListener('click', cleanup);
            deleteBtn.addEventListener('click', attemptDelete);
            passwordInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') attemptDelete();
            });
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) cleanup();
            });
        });
    }

    function formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    function scrollToBottom() {
        elements.messages.scrollTop = elements.messages.scrollHeight;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
