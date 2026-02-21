const express = require('express');
const router = express.Router();

// Edit user (admin)
router.put('/users/:id', async (req, res) => {
  try {
    const { name, phone, role } = req.body;
    const user = await require('../models/User').findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (role) user.role = role;
    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// Remove user (admin)
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await require('../models/User').findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});
// User stats controller
const userController = require('../controllers/userController');

/**
 * GET /api/admin/user-stats
 * Get user counts and details grouped by role
 */
router.get('/user-stats', userController.getUserStats);

const Assistant = require('../models/Assistant');
// const Booking = require('../models/Booking');
const AuditLog = require('../models/AuditLog');
const { authenticate, authorize } = require('../middleware/auth');

// Add Booking model for admin bookings API
const Booking = require('../models/Booking');

/**
 * DELETE /api/admin/assistants/:id
 * Remove an assistant (permanent delete)
 */
router.delete('/assistants/:id', async (req, res) => {
  try {
    const assistant = await Assistant.findByIdAndDelete(req.params.id);
    if (!assistant) {
      return res.status(404).json({ success: false, message: 'Assistant not found' });
    }
    // Optionally, log the deletion
    try {
      await AuditLog.create({
        action: 'delete_assistant',
        actorId: req.user?.id || req.user?._id,
        actorRole: 'admin',
        targetType: 'assistant',
        targetId: String(req.params.id),
        meta: { assistantName: assistant.name }
      });
    } catch (e) {}
    res.json({ success: true, message: 'Assistant removed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin'));

/**
 * GET /api/admin/assistants
 * Get all assistants with their document URLs
 */
router.get('/assistants', async (req, res) => {
  try {
    const assistants = await Assistant.find().sort({ createdAt: -1 });
    
    // Add full document URLs for each assistant
    const assistantsWithDocs = assistants.map(a => {
      const obj = a.toObject();
      obj.documentUrls = {
        aadhar: a.aadharFilePath || a.documents?.aadhar || null,
        pan: a.panFilePath || a.documents?.pan || null,
        photo: a.photoFilePath || null
      };
      return obj;
    });

    res.json({
      success: true,
      count: assistantsWithDocs.length,
      assistants: assistantsWithDocs
    });
  } catch (err) {
    console.error('[Admin] Get assistants error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/admin/assistants/:id
 * Get single assistant with documents
 */
router.get('/assistants/:id', async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) {
      return res.status(404).json({ success: false, message: 'Assistant not found' });
    }

    res.json({
      success: true,
      assistant: {
        ...assistant.toObject(),
        documentUrls: {
          aadhar: assistant.aadharFilePath || assistant.documents?.aadhar || null,
          pan: assistant.panFilePath || assistant.documents?.pan || null,
          photo: assistant.photoFilePath || null
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PATCH /api/admin/verify/:assistantId
 * Verify an assistant (approve)
 */
router.patch('/verify/:assistantId', async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.assistantId);
    if (!assistant) {
      return res.status(404).json({ success: false, message: 'Assistant not found' });
    }

    assistant.verified = true;
    assistant.documentsVerified = true;
    assistant.isEligibleForBookings = true;
    assistant.applicationStatus = 'Approved';
    await assistant.save();

    // Create audit log
    try {
      await AuditLog.create({
        action: 'verify_assistant',
        actorId: req.user?.id || req.user?._id,
        actorRole: 'admin',
        targetType: 'assistant',
        targetId: String(assistant._id),
        meta: { assistantName: assistant.name }
      });
    } catch (e) {
      console.error('Audit log error:', e.message);
    }

    console.log('[Admin] Verified assistant:', assistant.name);

    res.json({
      success: true,
      message: 'Assistant verified successfully',
      assistant
    });
  } catch (err) {
    console.error('[Admin] Verify error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PATCH /api/admin/reject/:assistantId
 * Reject an assistant (unverify)
 */
router.patch('/reject/:assistantId', async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.assistantId);
    if (!assistant) {
      return res.status(404).json({ success: false, message: 'Assistant not found' });
    }

    const reason = req.body?.reason || 'Rejected by admin';
    
    assistant.verified = false;
    assistant.documentsVerified = false;
    assistant.documentsRemark = reason;
    await assistant.save();

    // Create audit log
    try {
      await AuditLog.create({
        action: 'reject_assistant',
        actorId: req.user?.id || req.user?._id,
        actorRole: 'admin',
        targetType: 'assistant',
        targetId: String(assistant._id),
        meta: { assistantName: assistant.name, reason }
      });
    } catch (e) {
      console.error('Audit log error:', e.message);
    }

    console.log('[Admin] Rejected assistant:', assistant.name, 'Reason:', reason);

    res.json({
      success: true,
      message: 'Assistant rejected',
      assistant
    });
  } catch (err) {
    console.error('[Admin] Reject error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/admin/pending-verifications
 * Get assistants pending verification
 */
router.get('/pending-verifications', async (req, res) => {
  try {
    const pending = await Assistant.find({
      $or: [
        { verified: false },
        { documentsVerified: false }
      ]
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: pending.length,
      assistants: pending
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/admin/stats
 * Get dashboard statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const [
      totalAssistants,
      verifiedAssistants,
      pendingAssistants,
      totalBookings,
      pendingBookings,
      inProgressBookings,
      completedBookings,
      pendingApplications,
      feedbacks
    ] = await Promise.all([
      Assistant.countDocuments(),
      Assistant.countDocuments({ verified: true }),
      Assistant.countDocuments({ verified: false }),
      Booking.countDocuments(),
      Booking.countDocuments({ status: 'Pending' }),
      Booking.countDocuments({ status: { $in: ['Accepted', 'Start Pending', 'In Progress', 'Completion Pending'] } }),
      Booking.countDocuments({ status: 'Completed' }),
      Assistant.countDocuments({ applicationStatus: 'Pending' }),
      require('../models/Feedback').find({})
    ]);

    // Calculate rating stats
    const ratingCount = feedbacks.length;
    const avgRating = ratingCount > 0 ? (feedbacks.reduce((sum, f) => sum + (f.assistantRating || f.rating || 0), 0) / ratingCount).toFixed(2) : '0.00';

    res.json({
      success: true,
      stats: {
        assistants: {
          total: totalAssistants,
          verified: verifiedAssistants,
          pending: pendingAssistants
        },
        bookings: {
          total: totalBookings,
          pending: pendingBookings,
          inProgress: inProgressBookings,
          completed: completedBookings
        },
        applications: {
          pending: pendingApplications
        },
        jobsDone: completedBookings,
        ratingCount,
        avgRating
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/admin/audit-logs
 * Get recent audit logs
 */
router.get('/audit-logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const logs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================
// APPLICATION MANAGEMENT ROUTES
// ============================================

/**
 * GET /api/admin/applications
 * Get all assistant applications with filters
 */
router.get('/applications', async (req, res) => {
  try {
    const { status } = req.query;
    
    const query = { hasApplied: true };
    if (status && ['Pending', 'Approved', 'Rejected'].includes(status)) {
      query.applicationStatus = status;
    }

    const applications = await Assistant.find(query)
      .sort({ applicationDate: -1 })
      .select('-documents'); // Exclude legacy base64 docs

    // Add document URLs
    const appsWithDocs = applications.map(a => ({
      ...a.toObject(),
      documentUrls: {
        aadhar: a.aadharFilePath || null,
        pan: a.panFilePath || null,
        photo: a.photoFilePath || null
      }
    }));

    res.json({
      success: true,
      applications: appsWithDocs,
      count: appsWithDocs.length
    });
  } catch (err) {
    console.error('[Admin] Get applications error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/admin/applications/:id/approve
 * Approve an application
 */
router.post('/applications/:id/approve', async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    assistant.applicationStatus = 'Approved';
    assistant.approvalDate = new Date();
    assistant.editableApplication = false;
    assistant.verified = true;
    assistant.documentsVerified = true;
    assistant.rejectionReason = '';

    await assistant.save();

    // Create audit log
    try {
      await AuditLog.create({
        action: 'APPLICATION_APPROVED',
        targetType: 'assistant',
        targetId: assistant._id,
        performedBy: req.user?.id || 'admin',
        details: { name: assistant.name, station: assistant.station }
      });
    } catch (e) { /* ignore audit errors */ }

    console.log('[Admin] Approved application:', assistant._id, assistant.name);

    res.json({
      success: true,
      message: 'Application approved successfully',
      assistant
    });
  } catch (err) {
    console.error('[Admin] Approve error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/admin/applications/:id/reject
 * Reject an application
 */
router.post('/applications/:id/reject', async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id);
    if (!assistant) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const { reason, allowReapply = true } = req.body;

    assistant.applicationStatus = 'Rejected';
    assistant.rejectionReason = reason || 'Application rejected by admin';
    assistant.editableApplication = allowReapply;
    assistant.verified = false;

    await assistant.save();

    // Create audit log
    try {
      await AuditLog.create({
        action: 'APPLICATION_REJECTED',
        targetType: 'assistant',
        targetId: assistant._id,
        performedBy: req.user?.id || 'admin',
        details: { name: assistant.name, reason: assistant.rejectionReason }
      });
    } catch (e) { /* ignore audit errors */ }

    console.log('[Admin] Rejected application:', assistant._id, 'Reason:', reason);

    res.json({
      success: true,
      message: 'Application rejected',
      assistant
    });
  } catch (err) {
    console.error('[Admin] Reject error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /api/admin/clear-demo
router.patch('/clear-demo', async (req, res) => {
  try {
    // Clear demo data: bookings, assistants, users, feedback, audit logs
    const Booking = require('../models/Booking');
    const Assistant = require('../models/Assistant');
    const User = require('../models/User');
    const Feedback = require('../models/Feedback');
    const AuditLog = require('../models/AuditLog');

    await Booking.deleteMany({});
    await Assistant.deleteMany({});
    await User.deleteMany({ role: { $ne: 'admin' } }); // Keep admin users
    await Feedback.deleteMany({});
    await AuditLog.deleteMany({});

    res.json({ success: true, message: 'Demo data cleared' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to clear demo data: ' + err.message });
  }
});

module.exports = router;

/**
 * GET /api/admin/bookings
 * Get all bookings for admin, including passenger phone and email
 */
router.get('/bookings', async (req, res) => {
  try {
    const { status, station, passengerName } = req.query;
    const q = {};
    if (status) q.status = status;
    if (station) q.station = station;
    if (passengerName) q.passengerName = { $regex: passengerName, $options: 'i' };
    const bookings = await Booking.find(q)
      .sort({ createdAt: -1 })
      .populate('assistantId');
    res.json({
      success: true,
      count: bookings.length,
      bookings
    });
  } catch (err) {
    console.error('[Admin] Get bookings error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
