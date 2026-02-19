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
    // Dashboard stats: group statuses for real workflow
    const total = await Booking.countDocuments();
    const pending = await Booking.countDocuments({ status: 'Pending' });
    // In progress = Accepted, Start Pending, In Progress, Completion Pending
    const inProgress = await Booking.countDocuments({ status: { $in: ['Accepted', 'Start Pending', 'In Progress', 'Completion Pending'] } });
    const completed = await Booking.countDocuments({ status: 'Completed' });

    // Optionally, add rejected/cancelled if needed
    const byStation = await Booking.aggregate([
      { $group: { _id: '$station', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const assistantStats = await Assistant.aggregate([
      { $group: { _id: '$station', total: { $sum: 1 }, verified: { $sum: { $cond: ['$verified', 1, 0] } } } },
      { $sort: { total: -1 } }
    ]);

    // New: Sum up all assistants' completed jobs and ratings
    const assistants = await Assistant.find({}, 'totalBookingsCompleted ratingCount rating');
    const totalJobsDone = assistants.reduce((sum, a) => sum + (a.totalBookingsCompleted || 0), 0);
    const totalRatingCount = assistants.reduce((sum, a) => sum + (a.ratingCount || 0), 0);
    const avgRating = assistants.length > 0 ? (assistants.reduce((sum, a) => sum + (a.rating || 0), 0) / assistants.length).toFixed(2) : '0.00';

    res.json({
      success: true,
      overview: {
        total,
        pending,
        inProgress,
        completed,
        byStation,
        assistantStats,
        totalJobsDone,
        totalRatingCount,
        avgRating
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Clear only bookings
router.post('/clear-bookings', authenticate, authorize('admin'), async (req, res) => {
  try {
    await Booking.deleteMany({});
    res.json({ success: true, message: 'All bookings cleared' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Clear only assistants (but not users)
router.post('/clear-assistants', authenticate, authorize('admin'), async (req, res) => {
  try {
    await Assistant.deleteMany({});
    res.json({ success: true, message: 'All assistants cleared' });
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

