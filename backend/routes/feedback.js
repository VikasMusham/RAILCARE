const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const Booking = require('../models/Booking');
const Assistant = require('../models/Assistant');
const ServiceTask = require('../models/ServiceTask');
const { authenticate, authorize } = require('../middleware/auth');

// Passenger submits feedback for a booking (must be completed)
router.post('/', authenticate, async (req, res) => {
  try {
    console.log('[feedback:post] Request received');
    console.log('[feedback:post] User:', req.user?._id, req.user?.name);
    console.log('[feedback:post] Body:', JSON.stringify(req.body));
    
    const user = req.user;
    const { bookingId, assistantRating, appRating, assistantFeedback, appFeedback, wouldRecommend } = req.body;
    
    if (!bookingId || !assistantRating || !appRating) {
      console.log('[feedback:post] Missing required fields');
      return res.json({ success: false, message: 'bookingId, assistantRating and appRating required' });
    }
    
    const booking = await Booking.findById(bookingId).populate('assistantId');
    console.log('[feedback:post] Booking found:', booking?._id, 'Status:', booking?.status);
    if (!booking) return res.json({ success: false, message: 'Booking not found' });
    if (booking.status !== 'Completed') return res.json({ success: false, message: 'Can only rate completed bookings' });

    // If assistantId is missing (common for distributed round_trip tasks), try to infer
    // a primary assistant from the booking's ServiceTask assignments.
    // This preserves existing UX (single feedback per booking) while letting assistants/admin
    // see ratings tied to at least one assistant.
    if (!booking.assistantId) {
      try {
        const tasks = await ServiceTask.find({ bookingId }).sort({ taskSequence: 1 }).lean();
        const pickupAssistant = tasks.find(t => t.taskType === 'pickup' && t.assignedAssistant)?.assignedAssistant;
        const anyAssistant = tasks.find(t => t.assignedAssistant)?.assignedAssistant;
        const inferredAssistantId = pickupAssistant || anyAssistant || null;

        if (inferredAssistantId) {
          booking.assistantId = inferredAssistantId;
          await booking.save();
          console.log('[feedback:post] Inferred assistantId from tasks:', inferredAssistantId);
        }
      } catch (e) {
        console.warn('[feedback:post] Failed to infer assistantId from tasks:', e.message);
      }
    }
    
    // prevent duplicate feedback per booking
    const exists = await Feedback.findOne({ bookingId });
    console.log('[feedback:post] Existing feedback:', exists?._id);
    if (exists) return res.json({ success: false, message: 'Feedback already submitted for this booking' });
    
    const fb = new Feedback({ 
      bookingId, 
      passengerId: user.id || user._id, 
      passengerName: user.name || booking.passengerName,
      passengerPhone: user.phone || booking.passengerPhone,
      assistantId: booking.assistantId?._id || booking.assistantId,
      assistantName: booking.assistantId?.name || (booking.assistantId ? (await Assistant.findById(booking.assistantId).select('name').lean())?.name : null) || 'Unknown',
      station: booking.station,
      assistantRating, 
      appRating, 
      assistantFeedback, 
      appFeedback,
      wouldRecommend,
      // Legacy compatibility
      rating: assistantRating,
      comments: assistantFeedback
    });
    console.log('[feedback:post] Creating feedback:', fb);
    await fb.save();
    console.log('[feedback:post] Feedback saved successfully:', fb._id);
    
    // Mark booking as having feedback
    booking.hasFeedback = true;
    await booking.save();
    
    // Update assistant aggregate rating
    if (booking.assistantId) {
      const assistantIdStr = booking.assistantId._id || booking.assistantId;
      const agg = await Feedback.aggregate([
        { $match: { assistantId: assistantIdStr } },
        { $group: { _id: '$assistantId', avg: { $avg: '$assistantRating' }, count: { $sum: 1 } } }
      ]);
      const stats = agg && agg[0] ? agg[0] : null;
      if (stats) {
        await Assistant.findByIdAndUpdate(assistantIdStr, { $set: { rating: stats.avg, ratingCount: stats.count } });
      }
    }
    
    return res.json({ success: true, feedback: fb });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get feedback for an assistant
router.get('/assistant/:id', async (req, res) => {
  try {
    const list = await Feedback.find({ assistantId: req.params.id }).sort({ createdAt: -1 }).limit(200).lean();
    return res.json(list);
  } catch (err) { return res.status(500).json({ success: false, message: 'Server error' }); }
});

// Get feedback for a booking
router.get('/booking/:id', async (req, res) => {
  try {
    const fb = await Feedback.findOne({ bookingId: req.params.id }).lean();
    if (!fb) return res.json({ success: true, found: false });
    return res.json({ success: true, found: true, feedback: fb });
  } catch (err) { return res.status(500).json({ success: false, message: 'Server error' }); }
});

// Admin: list all feedbacks
router.get('/', authorize('admin'), async (req, res) => {
  try {
    const list = await Feedback.find()
      .populate('bookingId', 'station date time services')
      .populate('assistantId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean();
    res.json(list);
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

module.exports = router;
