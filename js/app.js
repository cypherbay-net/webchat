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
            elements.btnStartChat.disabled = elements.createPassword.value.length < 1;
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
            elements.btnJoinChat.disabled = !CypherCrypto.isValidSessionId(sessionId) || password.length < 1;
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
        contentEl.textContent = messageData.text;

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
