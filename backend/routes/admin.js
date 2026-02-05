const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Assistant = require('../models/Assistant');
const User = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');
const AuditLog = require('../models/AuditLog');

// Admin overview: counts and bookings by station
router.get('/overview', authenticate, authorize('admin'), async (req, res) => {
  try {
    const total = await Booking.countDocuments();
    const pending = await Booking.countDocuments({ status: 'Pending' });
    const accepted = await Booking.countDocuments({ status: 'Accepted' });
    const inProgress = await Booking.countDocuments({ status: 'In Progress' });
    const completed = await Booking.countDocuments({ status: 'Completed' });
    const rejected = await Booking.countDocuments({ status: 'Rejected' });

    const byStation = await Booking.aggregate([
      { $group: { _id: '$station', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const assistantStats = await Assistant.aggregate([
      { $group: { _id: '$station', total: { $sum: 1 }, verified: { $sum: { $cond: ['$verified', 1, 0] } } } },
      { $sort: { total: -1 } }
    ]);

    res.json({ success: true, overview: { total, pending, accepted, inProgress, completed, rejected, byStation, assistantStats } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Clear demo data: bookings, assistants, non-admin users
router.post('/clear', authenticate, authorize('admin'), async (req, res) => {
  try {
    await Booking.deleteMany({});
    await Assistant.deleteMany({});
    // keep admin users, remove others
    await User.deleteMany({ role: { $ne: 'admin' } });
    res.json({ success: true, message: 'Demo data cleared' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;

// Admin: view audit logs
router.get('/audit', authenticate, authorize('admin'), async (req, res) => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(500).lean();
    res.json({ success: true, logs });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

