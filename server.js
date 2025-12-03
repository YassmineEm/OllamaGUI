import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ 
    server,
    clientTracking: true,
    perMessageDeflate: false
});

const CONFIG = {
    OLLAMA_URL: 'http://127.0.0.1:11434/api/generate',
    PORT: 3000,
    RATE_LIMIT: {
        windowMs: 60000,
        max: 20
    }
};

const usersDB = [
    {
        id: 1,
        username: 'etudiant',
        password: 'tp2024',
        role: 'student'
    },
    {
        id: 2,
        username: 'professeur',
        password: 'admin2024',
        role: 'teacher'
    },
    {
        id: 3,
        username: 'test',
        password: 'test123',
        role: 'student'
    }
];


function generateToken(userId, username) {
    const timestamp = Date.now();
    const tokenData = `${userId}:${username}:${timestamp}:tp-secret-2024`;
    return Buffer.from(tokenData).toString('base64');
}


function verifyToken(token) {
    try {
        console.log('Vérification du token:', token?.substring(0, 20) + '...');
        const decoded = Buffer.from(token, 'base64').toString('ascii');
        console.log('Token décodé:', decoded);
        const parts = decoded.split(':');
        
        if (parts.length === 4 && parts[3] === 'tp-secret-2024') {
            const userId = parseInt(parts[0]);
            const username = parts[1];
            const timestamp = parseInt(parts[2]);
            

            const now = Date.now();
            if (now - timestamp > 24 * 60 * 60 * 1000) {
                console.log('Token expiré');
                return null;
            }
            
            return { userId, username, timestamp };
        }
    } catch (error) {
        console.error('Erreur vérification token:', error.message);
    }
    console.log('Token invalide');
    return null;
}


const storage = {
    sessions: new Map(),
    userConversations: new Map(),
    rateLimits: new Map(),
    models: ['llama3.2:3b', 'mistral', 'gemma', 'llama2']
};


app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(join(__dirname, 'public')));


app.use((req, res, next) => {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    next();
});


app.get('/api/test', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Ollama Chat TP - Authentification User/Password',
        version: '2.1.0',
        users: usersDB.map(u => ({ username: u.username, role: u.role })),
        timestamp: new Date().toISOString()
    });
});

app.post('/api/login', (req, res) => {
    try {
        console.log('Tentative de connexion:', req.body);
        
        const { username, password } = req.body;
        
        if (!username || !password) {
            console.log('Champs manquants');
            return res.status(400).json({ 
                success: false,
                error: 'Nom d\'utilisateur et mot de passe requis' 
            });
        }
        
        const user = usersDB.find(u => 
            u.username === username && u.password === password
        );
        
        if (!user) {
            console.log(`Identifiants incorrects: ${username}`);
            return res.status(401).json({ 
                success: false,
                error: 'Identifiants incorrects' 
            });
        }
        
        const token = generateToken(user.id, user.username);
        
        console.log(`✅ Connexion réussie: ${username} (ID: ${user.id})`);
        console.log(`🔑 Token généré: ${token.substring(0, 30)}...`);
        
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            },
            message: 'Connexion réussie',
            websocket_url: `ws://localhost:${CONFIG.PORT}`
        });
        
    } catch (error) {
        console.error('❌ Erreur login:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur serveur: ' + error.message 
        });
    }
});

// Route d'inscription
app.post('/api/register', (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false,
                error: 'Nom d\'utilisateur et mot de passe requis' 
            });
        }
        
        if (username.length < 3) {
            return res.status(400).json({ 
                success: false,
                error: 'Nom d\'utilisateur trop court (min 3 caractères)' 
            });
        }
        
        if (password.length < 4) {
            return res.status(400).json({ 
                success: false,
                error: 'Mot de passe trop court (min 4 caractères)' 
            });
        }
        
        if (usersDB.find(u => u.username === username)) {
            return res.status(400).json({ 
                success: false,
                error: 'Nom d\'utilisateur déjà pris' 
            });
        }
        
        const newUser = {
            id: usersDB.length + 1,
            username,
            password,
            role: 'student'
        };
        
        usersDB.push(newUser);
        const token = generateToken(newUser.id, newUser.username);
        
        console.log('Nouvel utilisateur créé:', username);
        
        res.json({
            success: true,
            token,
            user: {
                id: newUser.id,
                username: newUser.username,
                role: newUser.role
            },
            message: 'Inscription réussie'
        });
        
    } catch (error) {
        console.error('Erreur register:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur serveur' 
        });
    }
});


app.get('/api/check-ollama', async (req, res) => {
    try {
        console.log('Vérification d\'Ollama...');
        const response = await fetch('http://127.0.0.1:11434/api/tags', {
            method: 'GET',
            timeout: 5000
        }).catch(err => {
            console.error('Ollama ne répond pas:', err.message);
            throw err;
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('Ollama fonctionne, modèles:', data.models?.length || 0);
            res.json({ 
                success: true, 
                status: 'Ollama fonctionne',
                models: data.models || []
            });
        } else {
            console.error(' Ollama erreur HTTP:', response.status);
            res.status(500).json({ 
                success: false, 
                error: `Ollama erreur ${response.status}` 
            });
        }
    } catch (error) {
        console.error(' Ollama inaccessible:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Ollama ne répond pas. Assurez-vous qu\'il est installé et démarré.',
            details: error.message
        });
    }
});


app.get('/api/models', (req, res) => {
    res.json({ 
        success: true,
        models: storage.models 
    });
});


app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        websocketConnections: wss.clients.size,
        activeSessions: storage.sessions.size,
        registeredUsers: usersDB.length,
        memoryUsage: process.memoryUsage()
    });
});


app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
});


wss.on('connection', (ws, req) => {
    const clientId = Math.random().toString(36).substr(2, 9);
    const ip = req.socket.remoteAddress;
    console.log(`🔌 [${clientId}] Nouvelle connexion WebSocket depuis ${ip}`);
    
    let authenticated = false;
    let userData = null;
    let currentSessionId = null;
    

    setTimeout(() => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
                type: 'welcome',
                message: 'Connecté au serveur Ollama Chat',
                clientId,
                timestamp: new Date().toISOString(),
                requiresAuth: true
            }));
        }
    }, 100);
    
    ws.on('message', async (data) => {
        try {
            let parsed;
            try {
                parsed = JSON.parse(data.toString());
                console.log(`[${clientId}] Message reçu:`, parsed.type);
            } catch (parseError) {
                console.error(` [${clientId}] JSON invalide:`, data.toString().substring(0, 100));
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Message JSON invalide'
                }));
                return;
            }
            
            if (parsed.type === 'auth') {
                console.log(`[${clientId}] Tentative d'authentification...`);
                
                const { token } = parsed;
                
                if (!token) {
                    console.log(` [${clientId}] Token manquant`);
                    ws.send(JSON.stringify({
                        type: 'auth_error',
                        message: 'Token manquant'
                    }));
                    return;
                }
                
                userData = verifyToken(token);
                
                if (!userData) {
                    console.log(` [${clientId}] Token invalide`);
                    ws.send(JSON.stringify({
                        type: 'auth_error',
                        message: 'Token invalide ou expiré. Veuillez vous reconnecter.'
                    }));
                    return;
                }
                
                authenticated = true;
                currentSessionId = `session_${userData.userId}_${Date.now()}_${clientId}`;
                

                if (!storage.userConversations.has(userData.userId)) {
                    storage.userConversations.set(userData.userId, []);
                }
                
                storage.sessions.set(currentSessionId, {
                    userId: userData.userId,
                    username: userData.username,
                    clientId,
                    ip,
                    createdAt: new Date().toISOString(),
                    lastActivity: new Date().toISOString()
                });
                
                console.log(`[${clientId}] Authentifié: ${userData.username} (ID: ${userData.userId})`);
                
                ws.send(JSON.stringify({
                    type: 'authenticated',
                    sessionId: currentSessionId,
                    userId: userData.userId,
                    username: userData.username,
                    models: storage.models,
                    message: 'Authentification réussie'
                }));
                
                return;
            }
            

            if (!authenticated || !userData) {
                console.log(` [${clientId}] Tentative non authentifiée:`, parsed.type);
                ws.send(JSON.stringify({
                    type: 'auth_required',
                    message: 'Authentification requise. Envoyez un message "auth" avec votre token.'
                }));
                return;
            }
            

            const session = storage.sessions.get(currentSessionId);
            if (session) {
                session.lastActivity = new Date().toISOString();
            }
            

            switch (parsed.type) {
                case 'chat':
                    await handleChatMessage(ws, parsed, userData, currentSessionId, clientId);
                    break;
                    
                case 'get_history':
                    handleGetHistory(ws, userData.userId, currentSessionId, clientId);
                    break;
                    
                case 'clear_history':
                    handleClearHistory(ws, userData.userId, currentSessionId, clientId);
                    break;
                    
                case 'new_conversation':
                    handleNewConversation(ws, userData, clientId);
                    break;
                    
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
                    break;
                    
                default:
                    console.warn(` [${clientId}] Type inconnu:`, parsed.type);
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: `Type de message inconnu: ${parsed.type}`
                    }));
            }
            
        } catch (error) {
            console.error(` [${clientId}] Erreur traitement message:`, error);
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Erreur interne: ' + error.message
                }));
            }
        }
    });
    
    ws.on('close', () => {
        console.log(`🔌 [${clientId}] Déconnexion - Utilisateur: ${userData?.username || 'non authentifié'}`);
        if (currentSessionId) {
            storage.sessions.delete(currentSessionId);
        }
    });
    
    ws.on('error', (error) => {
        console.error(`[${clientId}] Erreur WebSocket:`, error.message);
    });
    

    const pingInterval = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
            try {
                ws.ping();
            } catch (error) {
                clearInterval(pingInterval);
            }
        } else {
            clearInterval(pingInterval);
        }
    }, 30000);
    

    ws.on('close', () => {
        clearInterval(pingInterval);
    });
});


async function handleChatMessage(ws, message, userData, sessionId, clientId) {
    const { content, model = 'llama3.2:3b' } = message;
    
    if (!content || !content.trim()) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Message vide'
        }));
        return;
    }
    
    console.log(`[${clientId}] ${userData.username}: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`);
    

    const userMessage = {
        type: 'user',
        content,
        timestamp: new Date().toISOString(),
        sessionId,
        model
    };
    
    const userHistory = storage.userConversations.get(userData.userId) || [];
    userHistory.push(userMessage);
    storage.userConversations.set(userData.userId, userHistory);
    
 
    ws.send(JSON.stringify({
        type: 'processing',
        messageId: Date.now(),
        timestamp: new Date().toISOString()
    }));
    
    try {

        const response = await fetch(CONFIG.OLLAMA_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                model,
                prompt: content,
                stream: true,
                options: {
                    temperature: 0.7,
                    num_predict: 512
                }
            })
        });
        
        if (!response.ok) {
            throw new Error(`Ollama erreur ${response.status}: ${response.statusText}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullResponse = '';
        let buffer = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            

            buffer = lines.pop() || '';
            
            for (const line of lines) {
                if (line.trim() === '') continue;
                
                try {
                    const data = JSON.parse(line);
                    if (data.response) {
                        fullResponse += data.response;
                        if (ws.readyState === ws.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'chunk',
                                content: data.response,
                                done: data.done || false
                            }));
                        }
                    }
                    
                    if (data.error) {
                        throw new Error(`Ollama: ${data.error}`);
                    }
                    
                } catch (parseError) {
                    console.warn(`[${clientId}] Ligne JSON invalide:`, line);
                }
            }
        }
        

        if (buffer.trim()) {
            try {
                const data = JSON.parse(buffer);
                if (data.response) {
                    fullResponse += data.response;
                    if (ws.readyState === ws.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'chunk',
                            content: data.response,
                            done: true
                        }));
                    }
                }
            } catch (e) {
            }
        }
        

        if (fullResponse) {
            const assistantMessage = {
                type: 'assistant',
                content: fullResponse,
                model,
                timestamp: new Date().toISOString(),
                sessionId
            };
            
            const userHistory = storage.userConversations.get(userData.userId) || [];
            userHistory.push(assistantMessage);
            storage.userConversations.set(userData.userId, userHistory);
            

            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({
                    type: 'complete',
                    fullResponse,
                    messageId: Date.now(),
                    timestamp: new Date().toISOString()
                }));
            }
        }
        
        console.log(` [${clientId}] Réponse envoyée (${fullResponse.length} caractères)`);
        
    } catch (error) {
        console.error(`[${clientId}] Erreur Ollama:`, error.message);
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Erreur avec Ollama: ' + error.message
            }));
        }
    }
}


function handleGetHistory(ws, userId, sessionId, clientId) {
    console.log(` [${clientId}] Récupération historique`);
    const userHistory = storage.userConversations.get(userId) || [];
    const sessionHistory = userHistory.filter(msg => msg.sessionId === sessionId);
    
    ws.send(JSON.stringify({
        type: 'history',
        messages: sessionHistory,
        count: sessionHistory.length,
        sessionId
    }));
}


function handleClearHistory(ws, userId, sessionId, clientId) {
    console.log(`🗑️ [${clientId}] Effacement historique session: ${sessionId}`);
    const userHistory = storage.userConversations.get(userId) || [];
    const filteredHistory = userHistory.filter(msg => msg.sessionId !== sessionId);
    storage.userConversations.set(userId, filteredHistory);
    
    ws.send(JSON.stringify({
        type: 'history_cleared',
        sessionId,
        message: 'Historique effacé'
    }));
}

function handleNewConversation(ws, userData, clientId) {
    const newSessionId = `session_${userData.userId}_${Date.now()}_${clientId}`;
    console.log(`🆕 [${clientId}] Nouvelle conversation: ${newSessionId}`);
    
    ws.send(JSON.stringify({
        type: 'new_conversation',
        sessionId: newSessionId,
        message: 'Nouvelle conversation créée'
    }));
}

server.listen(CONFIG.PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log(`🚀 Serveur Ollama Chat démarré !`);
    console.log(`🌐 HTTP:  http://localhost:${CONFIG.PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${CONFIG.PORT}`);
    console.log('');
    console.log('👤 Utilisateurs disponibles:');
    usersDB.forEach(user => {
        console.log(`   📝 ${user.username} (${user.role}) - mot de passe: ${user.password}`);
    });
    console.log('');
    console.log('🔍 Testez ces endpoints:');
    console.log(`   • http://localhost:${CONFIG.PORT}/api/test`);
    console.log(`   • http://localhost:${CONFIG.PORT}/api/check-ollama`);
    console.log(`   • http://localhost:${CONFIG.PORT}/api/health`);
    console.log('='.repeat(50));
});


process.on('SIGINT', () => {
    console.log('\n Arrêt du serveur...');
    wss.close(() => {
        console.log('WebSocket fermé');
        server.close(() => {
            console.log(' Serveur HTTP fermé');
            process.exit(0);
        });
    });
});