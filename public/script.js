const CONFIG = {
    BACKEND_URL: 'http://localhost:3000',
    WS_URL: 'ws://localhost:3000',
    AUTH_TOKEN: null,
    USER_INFO: null,
    MAX_MESSAGE_LENGTH: 2000,
    MAX_HISTORY: 50,
    RECONNECT_INTERVAL: 3000
};


let state = {
    ws: null,
    wsReady: false,
    currentMode: 'streaming',
    currentModel: 'llama3.2:3b',
    temperature: 0.7,
    isProcessing: false,
    conversationId: null,
    userId: null,
    username: null,
    conversationHistory: [],
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    isAuthenticated: false
};


const elements = {
    messageInput: document.getElementById('messageInput'),
    messagesContainer: document.getElementById('messagesContainer'),
    sendButton: document.getElementById('sendButton'),
    modelSelect: document.getElementById('modelSelect'),
    modeOptions: document.querySelectorAll('.mode-option'),
    tempSlider: document.getElementById('tempSlider'),
    tempValue: document.getElementById('tempValue'),
    charCount: document.getElementById('charCount'),
    currentModelBadge: document.getElementById('currentModelBadge'),
    historyList: document.getElementById('historyList'),
    quickPrompts: document.querySelectorAll('.prompt-btn'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    streamStatus: document.getElementById('streamStatus')
};


function init() {
    console.log('Initialisation de Ollama Lab...');
    
    const savedToken = localStorage.getItem('ollama_token');
    const savedUser = localStorage.getItem('ollama_user');
    
    if (savedToken && savedUser) {
        CONFIG.AUTH_TOKEN = savedToken;
        CONFIG.USER_INFO = JSON.parse(savedUser);
        state.isAuthenticated = true;
        state.username = CONFIG.USER_INFO.username;
        state.userId = CONFIG.USER_INFO.id;
        
        document.querySelector('.app-container').style.display = 'flex';
        
        startApplication();
    } else {
        showLoginModal();
    }
}

function showLoginModal() {
    console.log('🔐 Affichage de la modal de login');
    document.querySelector('.app-container').style.display = 'none';
    

    const modalHTML = `
        <div class="login-modal" id="loginModal">
            <div class="login-container">
                <div class="login-header">
                    <div class="logo">
                        <div class="logo-icon">🤖</div>
                        <h1>Ollama<span>Lab</span></h1>
                    </div>
                    <p class="subtitle">TP - Interface IA avec Authentification</p>
                </div>
                
                <div class="login-body">
                    <div class="login-card">
                        <h2><i class="fas fa-sign-in-alt"></i> Connexion</h2>
                        <p class="login-description">
                            Connectez-vous pour utiliser le chat IA local.
                        </p>
                        
                        <div class="form-group">
                            <label for="usernameInput">
                                <i class="fas fa-user"></i> Nom d'utilisateur
                            </label>
                            <input 
                                type="text" 
                                id="usernameInput" 
                                placeholder="Votre nom d'utilisateur"
                                autocomplete="username"
                                autocapitalize="off"
                                spellcheck="false"
                            >
                        </div>
                        
                        <div class="form-group">
                            <label for="passwordInput">
                                <i class="fas fa-lock"></i> Mot de passe
                            </label>
                            <input 
                                type="password" 
                                id="passwordInput" 
                                placeholder="Votre mot de passe"
                                autocomplete="current-password"
                            >
                        </div>
                        
                        <div class="form-actions">
                            <button id="loginBtn" class="btn-login">
                                <i class="fas fa-sign-in-alt"></i>
                                Se connecter
                            </button>
                            <button id="registerBtn" class="btn-default">
                                <i class="fas fa-user-plus"></i>
                                Créer un compte
                            </button>
                        </div>
                        
                        <div class="login-footer">
                            <div class="info-item">
                                <i class="fas fa-server"></i>
                                <span>Serveur: <code>${CONFIG.BACKEND_URL}</code></span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="register-card" id="registerCard" style="display: none;">
                        <h2><i class="fas fa-user-plus"></i> Créer un compte</h2>
                        <p class="login-description">
                            Créez votre compte pour utiliser le chat IA.
                        </p>
                        
                        <div class="form-group">
                            <label for="registerUsername">
                                <i class="fas fa-user"></i> Nom d'utilisateur
                            </label>
                            <input 
                                type="text" 
                                id="registerUsername" 
                                placeholder="Choisissez un nom d'utilisateur"
                                autocomplete="username"
                                autocapitalize="off"
                                spellcheck="false"
                            >
                        </div>
                        
                        <div class="form-group">
                            <label for="registerPassword">
                                <i class="fas fa-lock"></i> Mot de passe
                            </label>
                            <input 
                                type="password" 
                                id="registerPassword" 
                                placeholder="Choisissez un mot de passe"
                                autocomplete="new-password"
                            >
                        </div>
                        
                        <div class="form-group">
                            <label for="registerConfirmPassword">
                                <i class="fas fa-lock"></i> Confirmer le mot de passe
                            </label>
                            <input 
                                type="password" 
                                id="registerConfirmPassword" 
                                placeholder="Confirmez votre mot de passe"
                                autocomplete="new-password"
                            >
                        </div>
                        
                        <div class="form-actions">
                            <button id="submitRegisterBtn" class="btn-login">
                                <i class="fas fa-check"></i>
                                Créer le compte
                            </button>
                            <button id="backToLoginBtn" class="btn-default">
                                <i class="fas fa-arrow-left"></i>
                                Retour à la connexion
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalHTML;
    document.body.appendChild(modalDiv);
    
    // Événements pour la modal
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const backToLoginBtn = document.getElementById('backToLoginBtn');
    const submitRegisterBtn = document.getElementById('submitRegisterBtn');
    const loginCard = document.querySelector('.login-card');
    const registerCard = document.getElementById('registerCard');
    
    // Connexion
    loginBtn.addEventListener('click', () => {
        const username = document.getElementById('usernameInput').value.trim();
        const password = document.getElementById('passwordInput').value.trim();
        
        if (!username || !password) {
            showNotification('Veuillez remplir tous les champs', 'error');
            return;
        }
        
        login(username, password);
    });
    
    // Inscription
    registerBtn.addEventListener('click', () => {
        loginCard.style.display = 'none';
        registerCard.style.display = 'block';
    });
    
    backToLoginBtn.addEventListener('click', () => {
        loginCard.style.display = 'block';
        registerCard.style.display = 'none';
    });
    
    submitRegisterBtn.addEventListener('click', () => {
        const username = document.getElementById('registerUsername').value.trim();
        const password = document.getElementById('registerPassword').value.trim();
        const confirmPassword = document.getElementById('registerConfirmPassword').value.trim();
        
        if (!username || !password || !confirmPassword) {
            showNotification('Veuillez remplir tous les champs', 'error');
            return;
        }
        
        if (password !== confirmPassword) {
            showNotification('Les mots de passe ne correspondent pas', 'error');
            return;
        }
        
        if (password.length < 4) {
            showNotification('Le mot de passe doit faire au moins 4 caractères', 'error');
            return;
        }
        
        register(username, password);
    });
    
    // Enter key support
    document.getElementById('usernameInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('passwordInput').focus();
        }
    });
    
    document.getElementById('passwordInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const username = document.getElementById('usernameInput').value.trim();
            const password = document.getElementById('passwordInput').value.trim();
            if (username && password) login(username, password);
        }
    });
    

    setTimeout(() => {
        document.getElementById('usernameInput').focus();
    }, 100);
}

async function login(username, password) {
    console.log('Tentative de connexion pour:', username);
    
    showLoading('Connexion en cours...');
    
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            CONFIG.AUTH_TOKEN = data.token;
            CONFIG.USER_INFO = data.user;
            
            // Sauvegarder dans le localStorage
            localStorage.setItem('ollama_token', data.token);
            localStorage.setItem('ollama_user', JSON.stringify(data.user));
            
            // Supprimer la modal
            const modal = document.getElementById('loginModal');
            if (modal) modal.remove();
            
            // Démarrer l'application
            state.isAuthenticated = true;
            state.username = data.user.username;
            state.userId = data.user.id;
            
            startApplication();
            showNotification(`Bienvenue ${data.user.username} !`, 'success');
        } else {
            showNotification(data.error || 'Identifiants incorrects', 'error');
            hideLoading();
        }
        
    } catch (error) {
        console.error('❌ Erreur de connexion:', error);
        showNotification('Erreur de connexion au serveur', 'error');
        hideLoading();
    }
}

async function register(username, password) {
    console.log('📝 Tentative d\'inscription pour:', username);
    
    showLoading('Création du compte...');
    
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Compte créé avec succès !', 'success');
            
            // Revenir à la page de connexion et pré-remplir
            const registerCard = document.getElementById('registerCard');
            const loginCard = document.querySelector('.login-card');
            
            registerCard.style.display = 'none';
            loginCard.style.display = 'block';
            
            document.getElementById('usernameInput').value = username;
            document.getElementById('passwordInput').value = password;
            document.getElementById('passwordInput').focus();
            
            hideLoading();
        } else {
            showNotification(data.error || 'Erreur lors de la création du compte', 'error');
            hideLoading();
        }
        
    } catch (error) {
        console.error('❌ Erreur d\'inscription:', error);
        showNotification('Erreur de connexion au serveur', 'error');
        hideLoading();
    }
}

function startApplication() {
    console.log('✅ Authentifié en tant que:', state.username);
    
    // Afficher l'interface principale
    document.querySelector('.app-container').style.display = 'flex';
    
    // Mettre à jour l'affichage du nom d'utilisateur
    const sessionElement = document.getElementById('sessionId');
    if (sessionElement) {
        sessionElement.textContent = state.username;
    }
    
    // Charger l'état depuis le localStorage
    loadState();
    
    // Configurer les écouteurs d'événements
    setupEventListeners();
    
    // Connecter au WebSocket (SEULEMENT si authentifié)
    if (state.isAuthenticated && CONFIG.AUTH_TOKEN) {
        connectWebSocket();
    }
    
    // Afficher l'interface
    hideLoading();

    updateUI();
}

function connectWebSocket() {
    console.log('🔌 Connexion au WebSocket...');
    
    if (!state.isAuthenticated || !CONFIG.AUTH_TOKEN) {
        console.error('Non authentifié pour WebSocket');
        updateStreamStatus('Non authentifié', 'disconnected');
        return;
    }
    
    try {

        if (state.ws && state.ws.readyState !== WebSocket.CLOSED) {
            state.ws.close();
        }
        

        state.ws = new WebSocket(CONFIG.WS_URL);
        
        state.ws.onopen = () => {
            console.log('WebSocket connecté');
            updateStreamStatus('Connecté', 'connected');
            state.wsReady = true;
            state.reconnectAttempts = 0;
            
            state.ws.send(JSON.stringify({
                type: 'auth',
                token: CONFIG.AUTH_TOKEN
            }));
        };
        
        state.ws.onmessage = (event) => {
            handleWebSocketMessage(JSON.parse(event.data));
        };
        
        state.ws.onclose = (event) => {
            console.log(`🔌 WebSocket déconnecté (code: ${event.code}, raison: ${event.reason})`);
            updateStreamStatus('Déconnecté', 'disconnected');
            state.wsReady = false;
            
            if (event.code !== 1000 && state.reconnectAttempts < state.maxReconnectAttempts) {
                state.reconnectAttempts++;
                console.log(`Reconnexion (${state.reconnectAttempts}/${state.maxReconnectAttempts})...`);
                setTimeout(connectWebSocket, CONFIG.RECONNECT_INTERVAL);
            } else if (event.code === 4401 || event.code === 4403) {

                console.error('Erreur d\'authentification WebSocket');
                showNotification('Session expirée. Veuillez vous reconnecter.', 'error');
                setTimeout(logout, 2000);
            }
        };
        
        state.ws.onerror = (error) => {
            console.error('Erreur WebSocket:', error);
            updateStreamStatus('Erreur', 'error');
        };
        
    } catch (error) {
        console.error('Erreur connexion WebSocket:', error);
        updateStreamStatus('Erreur', 'error');
    }
}


function handleWebSocketMessage(data) {
    console.log('📨 Message reçu:', data.type);
    
    switch (data.type) {
        case 'authenticated':
            state.wsReady = true;
            state.conversationId = data.sessionId || Date.now().toString();
            console.log(`WebSocket authentifié`);
            

            elements.messageInput.disabled = false;
            elements.sendButton.disabled = false;
            
            // Charger l'historique
            requestHistory();
            break;
            
        case 'chunk':
            appendToLastMessage(data.content);
            break;
            
        case 'done':
            finishStreaming();
            break;
            
        case 'complete':
            finishStreaming();
            saveState();
            break;
            
        case 'response':
            handleCompleteResponse(data);
            break;
            
        case 'history':
            loadConversationHistory(data.messages);
            break;
            
        case 'history_cleared':
            clearMessages();
            showSuccess('Historique effacé');
            break;
            
        case 'new_conversation':
            state.conversationId = data.conversationId;
            clearMessages();
            showSuccess('Nouvelle conversation créée');
            saveState();
            break;
            
        case 'error':
            handleError(data.message);
            break;
            
        default:
            console.warn('Type de message inconnu:', data.type);
    }
}

function sendMessage() {
    if (!state.wsReady || !state.isAuthenticated) {
        showError('Non connecté au serveur. Vérifiez votre connexion.');
        if (!state.isAuthenticated) {
            showLoginModal();
        }
        return;
    }
    
    const message = elements.messageInput.value.trim();
    
    if (!message || state.isProcessing) return;
    
    if (message.length > CONFIG.MAX_MESSAGE_LENGTH) {
        showError(`Message trop long (max ${CONFIG.MAX_MESSAGE_LENGTH} caractères)`);
        return;
    }
    
    // Ajouter le message à l'historique local
    const userMessage = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
    };
    
    state.conversationHistory.push(userMessage);
    appendMessage(userMessage);
    
    // Effacer l'input
    elements.messageInput.value = '';
    updateCharCount();
    
    // Désactiver l'input pendant le traitement
    state.isProcessing = true;
    elements.messageInput.disabled = true;
    elements.sendButton.disabled = true;
    
    // Préparer la réponse de l'IA
    const assistantMessage = {
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString()
    };
    
    state.conversationHistory.push(assistantMessage);
    appendMessage(assistantMessage);
    
    // Envoyer au serveur via WebSocket
    try {
        state.ws.send(JSON.stringify({
            type: 'chat',
            message: message,
            model: state.currentModel,
            mode: state.currentMode,
            temperature: state.temperature,
            conversationId: state.conversationId
        }));
    } catch (error) {
        console.error('❌ Erreur envoi message:', error);
        handleError('Erreur d\'envoi du message');
    }
}

// ============================
// FONCTIONS UTILITAIRES AJOUTÉES
// ============================
function requestHistory() {
    if (state.wsReady && state.conversationId) {
        state.ws.send(JSON.stringify({
            type: 'get_history',
            conversationId: state.conversationId
        }));
    }
}

function startNewChat() {
    if (confirm('Voulez-vous vraiment commencer une nouvelle conversation ?')) {
        state.conversationId = Date.now().toString();
        clearMessages();
        state.conversationHistory = [];
        saveState();
        showSuccess('Nouvelle conversation créée');
        
        // Informer le serveur
        if (state.wsReady) {
            state.ws.send(JSON.stringify({
                type: 'new_conversation',
                conversationId: state.conversationId
            }));
        }
    }
}

// ============================
// FONCTIONS UTILITAIRES MODIFIÉES
// ============================
function logout() {
    // Supprimer les données d'authentification
    localStorage.removeItem('ollama_token');
    localStorage.removeItem('ollama_user');
    localStorage.removeItem('ollamaLabState');
    
    // Fermer la connexion WebSocket
    if (state.ws) {
        state.ws.close();
    }
    
    // Réinitialiser l'état
    state = {
        ws: null,
        wsReady: false,
        currentMode: 'streaming',
        currentModel: 'llama3.2:3b',
        temperature: 0.7,
        isProcessing: false,
        conversationId: null,
        userId: null,
        username: null,
        conversationHistory: [],
        reconnectAttempts: 0,
        maxReconnectAttempts: 5,
        isAuthenticated: false
    };
    
    CONFIG.AUTH_TOKEN = null;
    CONFIG.USER_INFO = null;
    
    showNotification('Déconnexion réussie', 'success');
    
    // Revenir à l'écran de login
    setTimeout(() => {
        showLoginModal();
    }, 500);
}

function showLoading(message) {
    if (elements.loadingOverlay) {
        elements.loadingOverlay.style.display = 'flex';
        elements.loadingOverlay.style.opacity = '1';
        const loadingText = document.getElementById('loadingText');
        if (loadingText) loadingText.textContent = message;
    }
}

function hideLoading() {
    if (elements.loadingOverlay) {
        elements.loadingOverlay.style.opacity = '0';
        setTimeout(() => {
            elements.loadingOverlay.style.display = 'none';
        }, 300);
    }
}

// ============================
// GESTION D'ÉTAT
// ============================
function saveState() {
    try {
        const appState = {
            currentModel: state.currentModel,
            currentMode: state.currentMode,
            temperature: state.temperature,
            conversationId: state.conversationId,
            conversationHistory: state.conversationHistory
        };
        localStorage.setItem('ollamaLabState', JSON.stringify(appState));
    } catch (error) {
        console.error('Erreur sauvegarde état:', error);
    }
}

function loadState() {
    try {
        const saved = localStorage.getItem('ollamaLabState');
        if (saved) {
            const appState = JSON.parse(saved);
            
            state.currentModel = appState.currentModel || 'llama3.2:3b';
            state.currentMode = appState.currentMode || 'streaming';
            state.temperature = appState.temperature || 0.7;
            state.conversationId = appState.conversationId;
            state.conversationHistory = appState.conversationHistory || [];
            elements.modelSelect.value = state.currentModel;
            elements.tempSlider.value = state.temperature;
            elements.tempValue.textContent = state.temperature;
            

            elements.modeOptions.forEach(option => {
                option.classList.toggle('active', option.dataset.mode === state.currentMode);
            });
            
            updateModelBadge();
            
            
            if (state.conversationHistory.length > 0) {
                state.conversationHistory.forEach(msg => appendMessage(msg, false));
            }
        }
    } catch (error) {
        console.error('Erreur chargement état:', error);
    }
}

function setupEventListeners() {
 
    elements.sendButton.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keydown', handleKeydown);
    

    elements.modelSelect.addEventListener('change', (e) => {
        state.currentModel = e.target.value;
        updateModelBadge();
        saveState();
        showSuccess(`Modèle changé: ${e.target.options[e.target.selectedIndex].text}`);
    });
    
    elements.modeOptions.forEach(option => {
        option.addEventListener('click', () => {
            elements.modeOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            state.currentMode = option.dataset.mode;
            saveState();
            showSuccess(`Mode ${state.currentMode === 'streaming' ? 'streaming' : 'standard'} activé`);
        });
    });
    
    // Contrôle de température
    elements.tempSlider.addEventListener('input', (e) => {
        state.temperature = parseFloat(e.target.value);
        elements.tempValue.textContent = state.temperature;
        saveState();
    });
    

    elements.messageInput.addEventListener('input', updateCharCount);
    

    document.addEventListener('click', (e) => {
        if (e.target.closest('.prompt-btn')) {
            const prompt = e.target.closest('.prompt-btn').dataset.prompt;
            elements.messageInput.value = prompt;
            updateCharCount();
            elements.messageInput.focus();
        }
    });

    document.querySelector('.btn-new-chat').addEventListener('click', startNewChat);
    document.getElementById('clearHistoryBtn').addEventListener('click', () => {
        if (confirm('Voulez-vous vraiment effacer l\'historique de cette conversation ?')) {
            if (state.wsReady) {
                state.ws.send(JSON.stringify({
                    type: 'clear_history'
                }));
            }
        }
    });
    
    // Déconnexion avec Ctrl+L
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'l') {
            e.preventDefault();
            logout();
        }
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) {
        const sidebarFooter = document.querySelector('.sidebar-footer');
        if (sidebarFooter) {
            const logoutButton = document.createElement('button');
            logoutButton.className = 'btn-new-chat';
            logoutButton.id = 'logoutBtn';
            logoutButton.style.background = 'var(--danger)';
            logoutButton.innerHTML = '<i class="fas fa-sign-out-alt"></i> Déconnexion';
            logoutButton.addEventListener('click', logout);
            sidebarFooter.appendChild(logoutButton);
        }
    }
    
 
    window.addEventListener('beforeunload', () => {
        saveState();
        if (state.ws) {
            state.ws.close();
        }
    });
}


function updateStreamStatus(text, status) {
    const statusElement = document.getElementById('connectionStatusText');
    if (statusElement) {
        statusElement.textContent = text;
        statusElement.className = `status-${status}`;
    }
    
    const statusDot = document.getElementById('wsStatusDot');
    if (statusDot) {
        statusDot.className = `status-dot ${status}`;
    }
}

function showError(message) {
    showNotification(message, 'error');
}

function showSuccess(message) {
    showNotification(message, 'success');
}

function showNotification(message, type = 'info') {

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;

    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}


function updateUI() {
    updateModelBadge();
    updateCharCount();
}

function updateModelBadge() {
    if (elements.currentModelBadge) {
        elements.currentModelBadge.textContent = state.currentModel;
    }
}

function updateCharCount() {
    const count = elements.messageInput.value.length;
    if (elements.charCount) {
        elements.charCount.textContent = `${count}/${CONFIG.MAX_MESSAGE_LENGTH}`;
        
        // Changer la couleur si approche de la limite
        if (count > CONFIG.MAX_MESSAGE_LENGTH * 0.9) {
            elements.charCount.style.color = '#ef4444';
        } else if (count > CONFIG.MAX_MESSAGE_LENGTH * 0.75) {
            elements.charCount.style.color = '#f59e0b';
        } else {
            elements.charCount.style.color = '#94a3b8';
        }
    }
}

function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function appendMessage(message, animate = true) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.role}`;
    
    const timestamp = new Date(message.timestamp).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <div class="message-sender">
                <i class="fas fa-${message.role === 'user' ? 'user' : 'robot'}"></i>
                <span>${message.role === 'user' ? 'Vous' : 'Assistant'}</span>
            </div>
            <div class="message-time">${timestamp}</div>
        </div>
        <div class="message-content">${message.content || ''}</div>
    `;
    
    if (animate) {
        messageDiv.style.opacity = '0';
        messageDiv.style.transform = 'translateY(10px)';
        elements.messagesContainer.appendChild(messageDiv);
        
        setTimeout(() => {
            messageDiv.style.transition = 'all 0.3s ease';
            messageDiv.style.opacity = '1';
            messageDiv.style.transform = 'translateY(0)';
        }, 10);
    } else {
        elements.messagesContainer.appendChild(messageDiv);
    }
    
    // Scroll vers le bas
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

function appendToLastMessage(content) {
    const lastMessage = elements.messagesContainer.querySelector('.message.assistant:last-child');
    if (lastMessage) {
        const contentElement = lastMessage.querySelector('.message-content');
        if (contentElement) {
            contentElement.textContent += content;
            
            // Scroll vers le bas
            elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
        }
    }
}

function finishStreaming() {
    state.isProcessing = false;
    elements.messageInput.disabled = false;
    elements.sendButton.disabled = false;
    elements.messageInput.focus();
    
    // Mettre à jour le dernier message avec le contenu final
    if (state.conversationHistory.length > 0) {
        const lastMsg = state.conversationHistory[state.conversationHistory.length - 1];
        if (lastMsg.role === 'assistant') {
            // On ne fait rien ici car le contenu est déjà ajouté via appendToLastMessage
        }
    }
}

function handleCompleteResponse(data) {
    const assistantMessage = {
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString()
    };
    
    state.conversationHistory.push(assistantMessage);
    appendMessage(assistantMessage);
    
    state.isProcessing = false;
    elements.messageInput.disabled = false;
    elements.sendButton.disabled = false;
    elements.messageInput.focus();
    
    saveState();
}

function handleError(errorMessage) {
    showNotification(errorMessage, 'error');
    
    state.isProcessing = false;
    elements.messageInput.disabled = false;
    elements.sendButton.disabled = false;
}

function loadConversationHistory(messages) {
    clearMessages();
    state.conversationHistory = messages;
    
    messages.forEach(msg => {
        appendMessage(msg, false);
    });
}

function clearMessages() {
    elements.messagesContainer.innerHTML = '';
    state.conversationHistory = [];
}

const style = document.createElement('style');
style.textContent = `
    /* Styles pour la modal d'authentification */
    .login-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        font-family: 'Inter', sans-serif;
    }
    
    .login-container {
        width: 100%;
        max-width: 480px;
        padding: 20px;
    }
    
    .login-header {
        text-align: center;
        margin-bottom: 2rem;
    }
    
    .login-header .logo {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        margin-bottom: 8px;
    }
    
    .login-header .logo-icon {
        font-size: 2.5rem;
    }
    
    .login-header h1 {
        font-size: 2rem;
        color: #fff;
        margin: 0;
    }
    
    .login-header span {
        color: #6d28d9;
    }
    
    .login-header .subtitle {
        color: #94a3b8;
        font-size: 0.9rem;
    }
    
    .login-card,
    .register-card {
        background: rgba(30, 41, 59, 0.95);
        backdrop-filter: blur(10px);
        border-radius: 16px;
        padding: 2rem;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.1);
        margin-bottom: 1.5rem;
    }
    
    .login-card h2,
    .register-card h2 {
        color: #fff;
        margin: 0 0 1rem 0;
        font-size: 1.5rem;
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    .login-card h2 i,
    .register-card h2 i {
        color: #6d28d9;
    }
    
    .login-description {
        color: #94a3b8;
        margin-bottom: 1.5rem;
        line-height: 1.5;
    }
    
    .form-group {
        margin-bottom: 1.5rem;
    }
    
    .form-group label {
        display: block;
        margin-bottom: 0.5rem;
        color: #e2e8f0;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    .form-group input {
        width: 100%;
        padding: 12px 16px;
        border: 2px solid #334155;
        border-radius: 8px;
        background: rgba(15, 23, 42, 0.8);
        color: #fff;
        font-size: 1rem;
        transition: all 0.2s;
    }
    
    .form-group input:focus {
        outline: none;
        border-color: #6d28d9;
        box-shadow: 0 0 0 3px rgba(109, 40, 217, 0.2);
    }
    
    .form-hint {
        margin-top: 0.5rem;
        font-size: 0.85rem;
        color: #94a3b8;
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 10px;
        background: rgba(15, 23, 42, 0.5);
        border-radius: 6px;
        margin-bottom: 1.5rem;
    }
    
    .form-hint i {
        color: #f59e0b;
        margin-top: 2px;
    }
    
    .form-actions {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-top: 2rem;
    }
    
    .btn-login {
        background: linear-gradient(135deg, #6d28d9 0%, #8b5cf6 100%);
        color: white;
        border: none;
        padding: 14px 20px;
        border-radius: 8px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
    }
    
    .btn-login:hover {
        background: linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%);
        transform: translateY(-2px);
        box-shadow: 0 10px 20px rgba(109, 40, 217, 0.3);
    }
    
    .btn-login:active {
        transform: translateY(0);
    }
    
    .btn-default {
        background: transparent;
        color: #94a3b8;
        border: 1px solid #475569;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 0.95rem;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
    }
    
    .btn-default:hover {
        background: rgba(255, 255, 255, 0.05);
        border-color: #6d28d9;
        color: #c4b5fd;
    }
    
    .login-footer {
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .info-item {
        display: flex;
        align-items: center;
        gap: 10px;
        color: #94a3b8;
        font-size: 0.9rem;
        justify-content: center;
    }
    
    .info-item i {
        color: #6d28d9;
    }
    
    /* Styles pour les notifications */
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        background: #1e293b;
        border-left: 4px solid #6d28d9;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 10000;
        transform: translateX(120%);
        transition: transform 0.3s ease;
        max-width: 400px;
    }
    
    .notification.show {
        transform: translateX(0);
    }
    
    .notification.success {
        border-left-color: #10b981;
    }
    
    .notification.success i {
        color: #10b981;
    }
    
    .notification.error {
        border-left-color: #ef4444;
    }
    
    .notification.error i {
        color: #ef4444;
    }
    
    .notification.info {
        border-left-color: #3b82f6;
    }
    
    .notification.info i {
        color: #3b82f6;
    }
    
    .notification i {
        font-size: 1.2rem;
    }
    
    .notification span {
        color: #f1f5f9;
        font-size: 0.95rem;
        line-height: 1.4;
    }
    
    /* Responsive */
    @media (max-width: 640px) {
        .login-container {
            padding: 16px;
        }
        
        .login-card,
        .register-card {
            padding: 1.5rem;
        }
        
        .notification {
            left: 20px;
            right: 20px;
            max-width: none;
        }
    }
`;
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', init);