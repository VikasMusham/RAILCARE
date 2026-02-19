const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { SECRET } = require('../middleware/auth');


const { authenticate } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  storage: multer.memoryStorage()
});
// Upload avatar (base64 or file)
router.post('/avatar', authenticate, upload.single('avatar'), async (req, res) => {
  try {
    const u = await User.findById(req.user.id);
    if (!u) return res.status(404).json({ success: false, message: 'User not found' });
    let avatarData = null;
    if (req.file) {
      // Accept file upload (image/*)
      avatarData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    } else if (req.body.avatar) {
      // Accept base64 string
      avatarData = req.body.avatar;
    }
    if (!avatarData) return res.status(400).json({ success: false, message: 'No avatar provided' });
    u.avatar = avatarData;
    await u.save();
    res.json({ success: true, message: 'Avatar updated', avatar: u.avatar });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get avatar for current user
router.get('/avatar', authenticate, async (req, res) => {
  try {
    const u = await User.findById(req.user.id);
    if (!u) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, avatar: u.avatar || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Register (any role) - for demo purposes
router.post('/register', async (req, res) => {
  try {
    const { name, phone, password, role } = req.body;
    if (!name || !phone || !password || !role) return res.status(400).json({ success: false, message: 'Missing fields' });
    const existing = await User.findOne({ phone });
    if (existing) return res.status(400).json({ success: false, message: 'Phone already registered' });
    const hash = await bcrypt.hash(password, 10);
    const u = new User({ name, phone, password: hash, role });
    await u.save();
    const token = jwt.sign({ id: u._id, role: u.role, name: u.name, phone: u.phone }, SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: u._id, name: u.name, role: u.role, phone: u.phone } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ success: false, message: 'Missing fields' });
    const u = await User.findOne({ phone });
    if (!u) return res.status(400).json({ success: false, message: 'User not found' });
    const ok = await bcrypt.compare(password, u.password || '');
    if (!ok) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const token = jwt.sign({ id: u._id, role: u.role, name: u.name, phone: u.phone }, SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: u._id, name: u.name, role: u.role, phone: u.phone } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Request password reset (demo: returns token in response)
router.post('/request-reset', async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ success: false, message: 'Phone required' });
    const u = await User.findOne({ phone });
    if (!u) return res.status(404).json({ success: false, message: 'User not found' });
    // generate short numeric token
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    u.resetToken = token;
    u.resetExpires = expires;
    await u.save();
    // In production we'd send via SMS; for demo return token
    res.json({ success: true, message: 'Reset token generated', token });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Reset password using phone + token
router.post('/reset-password', async (req, res) => {
  try {
    const { phone, token, newPassword } = req.body || {};
    if (!phone || !token || !newPassword) return res.status(400).json({ success: false, message: 'Missing fields' });
    const u = await User.findOne({ phone });
    if (!u) return res.status(404).json({ success: false, message: 'User not found' });
    if (!u.resetToken || !u.resetExpires) return res.status(400).json({ success: false, message: 'No reset requested' });
    if (u.resetToken !== String(token)) return res.status(400).json({ success: false, message: 'Invalid token' });
    if (u.resetExpires < new Date()) return res.status(400).json({ success: false, message: 'Token expired' });
    const hash = await bcrypt.hash(newPassword, 10);
    u.password = hash;
    u.resetToken = undefined;
    u.resetExpires = undefined;
    await u.save();
    // auto-login: issue token
    const jwtToken = jwt.sign({ id: u._id, role: u.role, name: u.name, phone: u.phone }, SECRET, { expiresIn: '7d' });
    res.json({ success: true, message: 'Password reset', token: jwtToken, user: { id: u._id, name: u.name, role: u.role, phone: u.phone } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get current user from token
router.get('/me', authenticate, async (req, res) => {
  try {
    const u = await User.findById(req.user.id).select('-password');
    if (!u) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: { id: u._id, name: u.name, role: u.role, phone: u.phone } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update profile (name / phone) - authenticated
router.put('/update', authenticate, async (req, res) => {
  try {
    const { name, phone } = req.body || {};
    const u = await User.findById(req.user.id);
    if (!u) return res.status(404).json({ success: false, message: 'User not found' });
    if (phone && phone !== u.phone) {
      const exists = await User.findOne({ phone });
      if (exists) return res.status(400).json({ success: false, message: 'Phone already in use' });
      u.phone = phone;
    }
    if (name) u.name = name;
    await u.save();
    const token = jwt.sign({ id: u._id, role: u.role, name: u.name, phone: u.phone }, SECRET, { expiresIn: '7d' });
    res.json({ success: true, message: 'Profile updated', token, user: { id: u._id, name: u.name, role: u.role, phone: u.phone } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;

