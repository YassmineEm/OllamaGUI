import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();

const CONFIG = {
  OLLAMA_URL: 'http://127.0.0.1:11434/api/generate',
  PORT: 3001,
  API_KEY: 'tp_ollama_2024' 
};


const sessions = new Map(); 


app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS']
}));

app.use(express.json());


const authenticate = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  
  if (!apiKey || apiKey !== CONFIG.API_KEY) {
    return res.status(401).json({ 
      error: 'Clé API invalide',
      hint: `Utilisez: x-api-key: ${CONFIG.API_KEY}`
    });
  }
  
  next();
};


app.post('/api/stream', authenticate, async (req, res) => {
  console.log('📥 Streaming request');
  
  try {
    const { message, model = 'llama3.2:3b', sessionId = 'default' } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message requis' });
    }

   
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, []);
    }
    
    const conversation = sessions.get(sessionId);
    
   
    conversation.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });

   
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    
    res.write(`data: ${JSON.stringify({ type: 'start', timestamp: new Date().toISOString() })}\n\n`);

    
    const response = await fetch(CONFIG.OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: message,
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullResponse = '';

    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.response) {
              fullResponse += data.response;
              
              res.write(`data: ${JSON.stringify({ 
                type: 'chunk', 
                content: data.response 
              })}\n\n`);
            }
          } catch (e) {
           
          }
        }
      }
    } finally {
      reader.releaseLock();
      
      
      conversation.push({
        role: 'assistant',
        content: fullResponse,
        model,
        timestamp: new Date().toISOString()
      });
      
    
      res.write('event: done\ndata: [DONE]\n\n');
      res.end();
    }

  } catch (err) {
    console.error(' Streaming error:', err);
    
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.write('event: done\ndata: [DONE]\n\n');
      res.end();
    }
  }
});

app.get('/api/history/:sessionId?', authenticate, (req, res) => {
  const sessionId = req.params.sessionId || 'default';
  const conversation = sessions.get(sessionId) || [];
  
  res.json({
    sessionId,
    messages: conversation,
    count: conversation.length
  });
});


app.delete('/api/history/:sessionId?', authenticate, (req, res) => {
  const sessionId = req.params.sessionId || 'default';
  sessions.delete(sessionId);
  
  res.json({ 
    success: true, 
    message: 'Historique effacé',
    sessionId 
  });
});


app.get('/api/stream/test', authenticate, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  const testMessages = [
    "Test de streaming SSE...",
    "Fonctionne correctement!",
    "Vous voyez le texte en temps réel.",
    "Parfait pour les réponses longues.",
    "Test terminé avec succès!"
  ];
  
  let index = 0;
  const sendNext = () => {
    if (index < testMessages.length) {
      res.write(`data: ${JSON.stringify({
        type: 'test',
        content: testMessages[index],
        index: index + 1,
        total: testMessages.length
      })}\n\n`);
      index++;
      setTimeout(sendNext, 500);
    } else {
      res.write('event: done\ndata: [DONE]\n\n');
      res.end();
    }
  };
  
  sendNext();
});


app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'ollama-sse',
    port: CONFIG.PORT,
    sessions: sessions.size,
    uptime: process.uptime()
  });
});


app.get('/api/info', (req, res) => {
  res.json({
    name: 'Ollama SSE Server',
    version: '1.0.0',
    endpoints: {
      stream: 'POST /api/stream',
      history: 'GET /api/history/:sessionId',
      test: 'GET /api/stream/test',
      health: 'GET /api/health'
    }
  });
});


const PORT = CONFIG.PORT;
app.listen(PORT, () => {
  console.log('=========================================');
  console.log(`⚡ SSE Server sur http://localhost:${PORT}`);
});