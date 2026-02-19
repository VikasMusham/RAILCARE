const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const mongoose = require('mongoose');
require('dotenv').config();

// Route imports
const bookingRoutes = require('./routes/booking');
const assistantRoutes = require('./routes/assistantRoutes'); // Updated to use new routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/adminRoutes'); // Updated to use new admin routes
const adminDashboardRoutes = require('./routes/adminDashboardRoutes'); // Super Dashboard APIs
const feedbackRoutes = require('./routes/feedback');
const trainRoutes = require('./routes/trains'); // Train search API
const schedulingRoutes = require('./routes/scheduling'); // Scheduling & task management
const { retrySearchingBookings } = require('./services/matchingService');

// Background Services (Enterprise Scheduling)
const trainDelayTracker = require('./services/trainDelayTracker');
const taskQueueProcessor = require('./services/taskQueueProcessor');

const app = express();
// Set Content Security Policy header to allow media-src 'self' and data:
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.socket.io; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; font-src 'self' https://fonts.gstatic https://fonts.googleapis.com; img-src 'self' data:; media-src 'self' data:; connect-src 'self' https://unpkg.com https://cdn.socket.io; ");
  next();
});

// --- SOCKET.IO SETUP FOR REAL-TIME CHAT ---
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Store chat messages in memory (for demo; use DB in production)
let chatMessages = [];
let typingUsers = {};

io.on('connection', (socket) => {
  console.log('[SOCKET] New connection:', socket.id);
  // Join room for admin or passenger
  socket.on('join', ({ role, bookingId }) => {
    if (role && bookingId) {
      socket.join(bookingId);
      socket.role = role;
      socket.bookingId = bookingId;
      // Send chat history
      socket.emit('chat_history', chatMessages.filter(m => m.bookingId === bookingId));
    }
  });
  // Handle new message
  socket.on('chat_message', (msg) => {
    console.log('[SOCKET] chat_message received:', msg);
    chatMessages.push(msg);
    io.to(msg.bookingId).emit('chat_message', msg);
    // If the sender is a passenger, emit emergency_chat event to all admins
    if (socket.role === 'passenger' && msg.bookingId) {
      io.emit('emergency_chat', { bookingId: msg.bookingId, user: msg.user, text: msg.text, time: msg.time });
    }
  });
  // Typing indicator
  socket.on('typing', ({ bookingId, user }) => {
    typingUsers[bookingId] = user;
    socket.to(bookingId).emit('typing', user);
  });
  socket.on('stop_typing', ({ bookingId }) => {
    delete typingUsers[bookingId];
    socket.to(bookingId).emit('stop_typing');
  });
  socket.on('disconnect', () => {
    if (socket.bookingId && typingUsers[socket.bookingId]) {
      delete typingUsers[socket.bookingId];
      socket.to(socket.bookingId).emit('stop_typing');
    }
  });
});
// Safe CORS for all origins and main methods
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));

// Parse JSON and URL-encoded bodies with increased limits for base64 uploads
app.use(bodyParser.json({ limit: '25mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '25mb' }));

// API routes
app.use('/api/bookings', bookingRoutes);
app.use('/api/assistants', assistantRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/dashboard', adminDashboardRoutes); // Super Dashboard
app.use('/api/feedback', feedbackRoutes);
app.use('/api/trains', trainRoutes); // Train search
app.use('/api/scheduling', schedulingRoutes); // Task scheduling & management

// Serve frontend static files
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// Serve uploaded files (documents, photos)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Error handling middleware
app.use((err, req, res, next) => {
  if (!err) return next();
  
  console.error('[Server Error]', err.message);
  
  // Handle Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ 
      success: false, 
      message: 'File too large. Maximum size is 5MB.' 
    });
  }
  
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({ 
      success: false, 
      message: 'Upload too large. Please upload files up to 5MB each.' 
    });
  }
  
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid JSON payload' 
    });
  }
  
  return res.status(err.status || 500).json({ 
    success: false, 
    message: err.message || 'Server error' 
  });
});

// Fallback to index.html for SPA-style navigation (only for non-API routes)
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

const PORT = 3000;

db.connect().then(() => {
  server.listen(PORT, () => {
    console.log('🚆 RailMitra Server started on port', PORT);
    
    // Start automatic matching retry for searching bookings (every 30 seconds)
    setInterval(() => {
      retrySearchingBookings();
    }, 30000);
    console.log('🔄 Auto-matching service started (30s interval)');
    
    // Start background scheduling services
    try {
      // Train delay tracker - monitors live train delays
      trainDelayTracker.start();
      console.log('🚂 Train delay tracker started');
      
      // Task queue processor - handles task assignments and SLA monitoring
      taskQueueProcessor.start();
      console.log('📋 Task queue processor started');
      
      // Listen for delay events and log them
      trainDelayTracker.on('delayDetected', (data) => {
        console.log(`⚠️  Train ${data.trainNumber} delayed by ${data.delayMinutes} minutes`);
      });
      
      trainDelayTracker.on('tasksRescheduled', (data) => {
        console.log(`🔄 Rescheduled ${data.tasksUpdated} tasks for train ${data.trainNumber}`);
      });
      
      // Listen for task processor events
      taskQueueProcessor.on('taskAssigned', (data) => {
        console.log(`✅ Task ${data.taskId} assigned to assistant ${data.assistantId}`);
      });
      
    } catch (err) {
      console.warn('⚠️  Background services failed to start:', err.message);
      // Non-critical - server continues without background services
    }
  });
}).catch(err => {
  console.error('❌ DB connect failed:', err.message);
});

// mongoose.connect(process.env.MONGODB_URI, {
//   useNewUrlParser: true,
//   useUnifiedTopology: true
// }).then(() => {
//   console.log('MongoDB connected');
// }).catch((err) => {
//   console.error('MongoDB connection error:', err);
// });
