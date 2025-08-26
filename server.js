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

app.get('/api/results', (req, res) => {
  res.json(getResponseData());
});

io.on('connection', (socket) => {
  console.log('New client connected');
  
  socket.emit('updateResults', getResponseData());
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});