// Assistant: request re-verification after being revoked
router.post('/:id/request-reverify', async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) return res.status(404).json({ success: false, message: 'Not found' });
    assistant.requestedReverify = true;
    await assistant.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
// Admin: re-verify a revoked assistant
router.post('/:id/verify-again', authenticate, authorize('admin'), async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) return res.status(404).json({ success: false, message: 'Not found' });
    assistant.revoked = false;
    assistant.verified = true;
    await assistant.save();
    res.json({ success: true, assistant });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
const express = require('express');
const router = express.Router();
const Assistant = require('../models/Assistant');
const Booking = require('../models/Booking');
const { authenticate, authorize } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

// Register assistant
router.post('/register', async (req, res) => {
  try {
    const data = req.body || {};
    // try to parse Authorization token if present to associate assistant with a user
    let userId = null;
    try {
      const h = req.headers['authorization'];
      if (h) {
        const parts = h.split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
          const jwt = require('jsonwebtoken');
          const { SECRET } = require('../middleware/auth');
          const payload = jwt.verify(parts[1], SECRET);
          if (payload && payload.id) userId = payload.id;
        }
      }
    } catch (e) { /* ignore token parse errors - registration still allowed */ }

    // avoid duplicates: if userId exists and assistant already created for this user, return existing
    if (userId) {
      const existing = await Assistant.findOne({ userId: String(userId) });
      if (existing) return res.json({ success: true, assistant: existing, message: 'Already registered' });
    }

    // also avoid creating exact duplicate by name+station
    if (data.name && data.station) {
      const dup = await Assistant.findOne({ name: data.name, station: data.station });
      if (dup) return res.json({ success: true, assistant: dup, message: 'Assistant already exists for this name and station' });
    }

    const a = new Assistant({ ...data, verified: false });
    if (userId) a.userId = String(userId);
    await a.save();
    res.json({ success: true, assistant: a });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get assistants (admin)
router.get('/', async (req, res) => {
  const list = await Assistant.find().sort({ createdAt: -1 });
  res.json(list);
});

// Get single assistant by id
router.get('/:id', async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, assistant });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get bookings for assistant by station and pending
router.get('/:id/bookings', async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) return res.status(404).json({ success: false });
    // Return bookings that are either pending at the assistant's station
    // or already assigned to this assistant (so they can see their accepted/in-progress bookings)
    const bookings = await Booking.find({
      $or: [
        { station: assistant.station, status: 'Pending' },
        { assistantId: assistant._id }
      ]
    }).sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Admin: approve assistant
router.post('/:id/approve', authenticate, authorize('admin'), async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) return res.status(404).json({ success: false, message: 'Not found' });
    assistant.verified = true;
    await assistant.save();
    res.json({ success: true, assistant });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Admin: reject assistant (unverify)
router.post('/:id/reject', authenticate, authorize('admin'), async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) return res.status(404).json({ success: false });
    assistant.verified = false;
    assistant.revoked = true;
    await assistant.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Admin: edit assistant details
router.put('/:id', authenticate, async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) return res.status(404).json({ success: false, message: 'Not found' });
    // allow admin or the assistant owner (if associated via userId)
    const user = req.user || {};
    const isAdmin = user.role === 'admin';
    const isOwner = user.role === 'assistant' && assistant.userId && assistant.userId.toString() === (user.id || user._id || '').toString();
    if (!isAdmin && !isOwner) return res.status(403).json({ success: false, message: 'Forbidden' });
    const { name, station, languages, verified } = req.body || {};
    if (name !== undefined) assistant.name = name;
    if (station !== undefined) assistant.station = station;
    if (languages !== undefined) assistant.languages = Array.isArray(languages) ? languages : (typeof languages === 'string' ? languages.split(',').map(s=>s.trim()).filter(Boolean) : assistant.languages);
    if (verified !== undefined && isAdmin) assistant.verified = Boolean(verified);
    await assistant.save();
    res.json({ success: true, assistant });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Upload assistant documents via JSON base64 payload. Fields: aadharBase64,aadharName,panBase64,panName
// Simplified: no auth check; accepts Aadhar and PAN independently; returns updated assistant
router.post('/:id/upload-json', async (req, res) => {
  try {
    console.log('upload-json hit for assistant', req.params.id, 'body keys:', Object.keys(req.body || {}));

    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) {
      return res.status(404).json({ success: false, message: 'Assistant not found' });
    }

    const { aadharBase64, aadharName, panBase64, panName } = req.body || {};

    const hasAadhar = Boolean(aadharBase64 && aadharName);
    const hasPan = Boolean(panBase64 && panName);
    if (!hasAadhar && !hasPan) {
      return res.status(400).json({ success: false, message: 'Please select at least one document (Aadhar or PAN) to upload' });
    }

    const uploadsDir = path.join(__dirname, '..', 'uploads', 'assistants', String(assistant._id));
    fs.mkdirSync(uploadsDir, { recursive: true });

    const safeWrite = (base64, name) => {
      const buf = Buffer.from(base64, 'base64');
      const fname = Date.now() + '-' + String(name || 'doc').replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const full = path.join(uploadsDir, fname);
      fs.writeFileSync(full, buf);
      return '/' + path.join('uploads', 'assistants', String(assistant._id), fname).replace(/\\/g, '/');
    };

    try {
      assistant.documents = assistant.documents || {};
      if (hasAadhar) {
        assistant.documents.aadhar = safeWrite(aadharBase64, aadharName);
      }
      if (hasPan) {
        assistant.documents.pan = safeWrite(panBase64, panName);
      }
      // any new upload invalidates prior verification/remark
      assistant.documentsVerified = false;
      assistant.documentsRemark = '';
    } catch (e) {
      console.error('upload-json write error', e);
      return res.status(400).json({ success: false, message: 'Could not save file(s): ' + e.message });
    }

    await assistant.save();
    const fresh = await Assistant.findById(assistant._id);
    console.log('upload-json saved documents for assistant', assistant._id, 'docs:', fresh.documents);
    return res.json({ success: true, assistant: fresh });
  } catch (err) {
    console.error('upload-json server error', err);
    return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Admin: mark documents as verified
router.post('/:id/verify-docs', authenticate, authorize('admin'), async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) return res.status(404).json({ success: false, message: 'Not found' });
    const remark = (req.body && req.body.remark) ? String(req.body.remark).slice(0, 500) : '';
    assistant.documentsVerified = true;
    if (remark) assistant.documentsRemark = remark;
    await assistant.save();
    // record audit log
    try {
      const AuditLog = require('../models/AuditLog');
      await AuditLog.create({ action: 'verify_docs', actorId: req.user && (req.user.id || req.user._id), actorRole: req.user && req.user.role, targetType: 'assistant', targetId: String(assistant._id), meta: { assistantName: assistant.name, remark } });
    } catch (e) { console.error('Audit log failed', e.message); }
    return res.json({ success: true, assistant });
  } catch (err) { return res.status(500).json({ success: false, message: 'Server error' }); }
});

module.exports = router;
