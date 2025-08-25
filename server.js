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

app.use(express.static('public'));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'progress-poll-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 3600000 }
}));

function getResponseCounts() {
  return {
    needAssistance: responses.needAssistance.size,
    ready: responses.ready.size
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
  
  io.emit('updateResults', getResponseCounts());
  res.json({ success: true, counts: getResponseCounts() });
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
  
  io.emit('updateResults', getResponseCounts());
  res.json({ success: true });
});

app.get('/api/results', (req, res) => {
  res.json(getResponseCounts());
});

io.on('connection', (socket) => {
  console.log('New client connected');
  
  socket.emit('updateResults', getResponseCounts());
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});