const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

let responses = {
  needAssistance: new Set(),
  ready: new Set()
};

let chartMaximum = 30;

let chatMessages = [];
let messageIdCounter = 1;

app.use(express.static('public'));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'progress-poll-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 3600000 }
}));

function getResponseData() {
  return {
    counts: {
      needAssistance: responses.needAssistance.size,
      ready: responses.ready.size
    },
    maximum: chartMaximum
  };
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/api/vote', (req, res) => {
  const { vote, userId } = req.body;
  
  if (vote === 'needAssistance') {
    responses.needAssistance.add(userId);
    responses.ready.delete(userId);
  } else if (vote === 'ready') {
    responses.ready.add(userId);
    responses.needAssistance.delete(userId);
  } else if (vote === 'clear') {
    responses.needAssistance.delete(userId);
    responses.ready.delete(userId);
  }
  
  io.emit('updateResults', getResponseData());
  res.json({ success: true, ...getResponseData() });
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Invalid password' });
  }
});

app.post('/api/admin/clear-all', (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  responses.needAssistance.clear();
  responses.ready.clear();
  
  io.emit('updateResults', getResponseData());
  res.json({ success: true });
});

app.post('/api/clear-all', (req, res) => {
  responses.needAssistance.clear();
  responses.ready.clear();
  
  io.emit('updateResults', getResponseData());
  res.json({ success: true, ...getResponseData() });
});

app.post('/api/admin/set-maximum', (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  const { maximum } = req.body;
  
  if (typeof maximum === 'number' && maximum > 0) {
    chartMaximum = maximum;
    io.emit('updateResults', getResponseData());
    res.json({ success: true, maximum: chartMaximum });
  } else {
    res.status(400).json({ success: false, message: 'Invalid maximum value' });
  }
});

app.post('/api/admin/decrement-assistance', (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  if (responses.needAssistance.size > 0) {
    const firstUserId = responses.needAssistance.values().next().value;
    responses.needAssistance.delete(firstUserId);
    
    io.emit('updateResults', getResponseData());
    res.json({ success: true, removed: firstUserId });
  } else {
    res.json({ success: false, message: 'No assistance requests to remove' });
  }
});

app.get('/api/results', (req, res) => {
  res.json(getResponseData());
});

// Chat endpoints
app.get('/api/chat/messages', (req, res) => {
  res.json(chatMessages);
});

app.post('/api/chat/message', (req, res) => {
  const { content, author, userId, replyTo } = req.body;
  
  if (!content || !userId) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }
  
  const message = {
    id: `msg_${messageIdCounter++}`,
    content: content.substring(0, 500), // Limit message length
    author: author || '',
    userId: userId,
    timestamp: Date.now(),
    replyTo: replyTo || null
  };
  
  chatMessages.push(message);
  
  // Keep only last 100 messages
  if (chatMessages.length > 100) {
    chatMessages = chatMessages.slice(-100);
  }
  
  io.emit('newMessage', message);
  res.json({ success: true, message });
});

io.on('connection', (socket) => {
  console.log('New client connected');
  
  socket.emit('updateResults', getResponseData());
  socket.emit('messageHistory', chatMessages);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});