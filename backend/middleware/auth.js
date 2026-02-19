const jwt = require('jsonwebtoken');
const Assistant = require('../models/Assistant');

const SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET.trim() !== '' ? process.env.JWT_SECRET : 'railcare_secret_key';

function authenticate(req, res, next) {
  const h = req.headers['authorization'];
  console.log('[authenticate] Authorization header:', h);
  if (!h) {
    console.warn('[authenticate] Missing auth token');
    return res.status(401).json({ success: false, message: 'Missing auth token' });
  }
  const parts = h.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    console.warn('[authenticate] Invalid auth header:', h);
    return res.status(401).json({ success: false, message: 'Invalid auth header' });
  }
  const token = parts[1];
  try {
    const payload = jwt.verify(token, SECRET);
    console.log('[authenticate] Token payload:', payload);
    req.user = payload;
    next();
  } catch (err) {
    console.warn('[authenticate] Invalid token:', err.message);
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

function authorize(role) {
  return (req, res, next) => {
    console.log('[authorize] req.user:', req.user);
    console.log('[authorize] required role:', role);
    if (!req.user) {
      console.warn('[authorize] Not authenticated - req.user missing');
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    if (Array.isArray(role)) {
      if (!role.includes(req.user.role)) {
        console.warn('[authorize] Forbidden - user role:', req.user.role, 'required:', role);
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      return next();
    }
    if (req.user.role !== role) {
      console.warn('[authorize] Forbidden - user role:', req.user.role, 'required:', role);
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    next();
  };
}

/**
 * Middleware to check if assistant has applied and is approved
 * Used to protect dashboard access for non-approved assistants
 */
async function requireApprovedAssistant(req, res, next) {
  try {
    if (!req.user || req.user.role !== 'assistant') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Assistant role required.',
        redirect: '/login.html'
      });
    }

    // Find assistant by userId
    const assistant = await Assistant.findOne({ userId: req.user.id });
    
    if (!assistant) {
      return res.status(403).json({ 
        success: false, 
        message: 'No application found. Please apply first.',
        redirect: '/assistant-apply.html',
        applicationStatus: 'Not Applied'
      });
    }

    if (!assistant.hasApplied) {
      return res.status(403).json({ 
        success: false, 
        message: 'Please complete your application first.',
        redirect: '/assistant-apply.html',
        applicationStatus: 'Not Applied'
      });
    }

    if (assistant.applicationStatus === 'Pending') {
      return res.status(403).json({ 
        success: false, 
        message: 'Your application is under review.',
        redirect: '/assistant-status.html',
        applicationStatus: 'Pending'
      });
    }

    if (assistant.applicationStatus === 'Rejected') {
      return res.status(403).json({ 
        success: false, 
        message: 'Your application was rejected. Please update and reapply.',
        redirect: '/assistant-status.html',
        applicationStatus: 'Rejected'
      });
    }

    if (assistant.applicationStatus !== 'Approved') {
      return res.status(403).json({ 
        success: false, 
        message: 'Application not approved.',
        redirect: '/assistant-status.html',
        applicationStatus: assistant.applicationStatus
      });
    }

    // Attach assistant to request for use in route handlers
    req.assistant = assistant;
    next();
  } catch (err) {
    console.error('[requireApprovedAssistant] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error checking application status' });
  }
}

/**
 * Middleware to get assistant application status (doesn't block, just attaches)
 */
async function attachAssistantStatus(req, res, next) {
  try {
    if (req.user && req.user.role === 'assistant') {
      const assistant = await Assistant.findOne({ userId: req.user.id });
      if (assistant) {
        req.assistant = assistant;
        req.applicationStatus = assistant.applicationStatus;
      }
    }
    next();
  } catch (err) {
    next(); // Continue even on error
  }
}

module.exports = { authenticate, authorize, requireApprovedAssistant, attachAssistantStatus, SECRET };
