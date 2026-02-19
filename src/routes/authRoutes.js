const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SECRET = process.env.JWT_SECRET || 'railmitra_secret';

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, phone, password, role } = req.body;
    if (!name || !phone || !password) return res.status(400).json({ message: 'Missing fields' });
    const exists = await User.findOne({ phone });
    if (exists) return res.status(400).json({ message: 'Phone already registered' });
    const user = await User.create({ name, phone, password, role });
    const token = jwt.sign({ name: user.name, phone: user.phone, role: user.role, exp: Math.floor(Date.now() / 1000) + 86400 }, SECRET);
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return res.status(400).json({ message: 'User not found' });
    const match = await user.comparePassword(password);
    if (!match) return res.status(400).json({ message: 'Incorrect password' });
    const token = jwt.sign({ name: user.name, phone: user.phone, role: user.role, exp: Math.floor(Date.now() / 1000) + 86400 }, SECRET);
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ message: 'No token' });
    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, SECRET);
    const user = await User.findOne({ phone: payload.phone });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user: { name: user.name, phone: user.phone, role: user.role } });
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

module.exports = router;
