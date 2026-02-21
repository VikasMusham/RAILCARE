/**
 * Admin Dashboard Routes
 * Production-grade analytics and management APIs
 */

const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Assistant = require('../models/Assistant');
const { authenticate, authorize } = require('../middleware/auth');
const { matchAssistant, reassignBooking, releaseAssistant } = require('../services/matchingService');

// All routes require admin authentication
router.use(authenticate, authorize('admin'));

/**
 * GET /api/admin/dashboard/stats
 * Get all dashboard statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Run all aggregations in parallel for performance
    const Feedback = require('../models/Feedback');
    const [
      bookingStats,
      assistantStats,
      revenueStats,
      applicationStats,
      weeklyTrend,
      totalJobsDone,
      totalRatings,
      avgRating
    ] = await Promise.all([
      // Booking statistics
      Booking.aggregate([
        {
          $facet: {
            today: [
              { $match: { createdAt: { $gte: today, $lt: tomorrow } } },
              { $count: 'count' }
            ],
            total: [{ $count: 'count' }],
            active: [
              { $match: { status: { $in: ['Pending', 'Searching', 'Assigned', 'Accepted', 'In Progress'] } } },
              { $count: 'count' }
            ],
            completed: [
              { $match: { status: 'Completed' } },
              { $count: 'count' }
            ],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ]
          }
        }
      ]),

      // Assistant statistics
      Assistant.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            verified: [
              { $match: { applicationStatus: 'Approved' } },
              { $count: 'count' }
            ],
            online: [
              { $match: { isOnline: true, applicationStatus: 'Approved' } },
              { $count: 'count' }
            ],
            eligible: [
              { $match: { isEligibleForBookings: true } },
              { $count: 'count' }
            ]
          }
        }
      ]),

      // Revenue statistics
      Booking.aggregate([
        { $match: { status: 'Completed', paymentStatus: 'Paid' } },
        {
          $facet: {
            today: [
              { $match: { createdAt: { $gte: today, $lt: tomorrow } } },
              { $group: { _id: null, total: { $sum: { $toDouble: '$serviceType' } } } }
            ],
            total: [
              { $group: { _id: null, total: { $sum: { $toDouble: '$serviceType' } } } }
            ]
          }
        }
      ]),

      // Application statistics
      Assistant.aggregate([
        {
          $facet: {
            pending: [
              { $match: { applicationStatus: 'Pending' } },
              { $count: 'count' }
            ],
            onHold: [
              { $match: { applicationStatus: 'On Hold' } },
              { $count: 'count' }
            ],
            rejected: [
              { $match: { applicationStatus: 'Rejected' } },
              { $count: 'count' }
            ]
          }
        }
      ]),

      // Weekly booking trend
      Booking.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      // Total jobs done (completed bookings)
      Booking.countDocuments({ status: 'Completed' }),

      // Total ratings (feedback count)
      Feedback.countDocuments({ assistantRating: { $exists: true } }),

      // Average rating (assistantRating)
      Feedback.aggregate([
        { $match: { assistantRating: { $exists: true } } },
        { $group: { _id: null, avg: { $avg: '$assistantRating' } } }
      ])
    ]);

    // Parse results
    const stats = {
      bookings: {
        today: bookingStats[0].today[0]?.count || 0,
        total: bookingStats[0].total[0]?.count || 0,
        active: bookingStats[0].active[0]?.count || 0,
        completed: bookingStats[0].completed[0]?.count || 0,
        byStatus: bookingStats[0].byStatus.reduce((acc, s) => {
          acc[s._id] = s.count;
          return acc;
        }, {})
      },
      assistants: {
        total: assistantStats[0].total[0]?.count || 0,
        verified: assistantStats[0].verified[0]?.count || 0,
        online: assistantStats[0].online[0]?.count || 0,
        eligible: assistantStats[0].eligible[0]?.count || 0
      },
      revenue: {
        today: revenueStats[0].today[0]?.total || 0,
        total: revenueStats[0].total[0]?.total || 0
      },
      applications: {
        pending: applicationStats[0].pending[0]?.count || 0,
        onHold: applicationStats[0].onHold[0]?.count || 0,
        rejected: applicationStats[0].rejected[0]?.count || 0
      },
      weeklyTrend,
      // New stats for dashboard
      totalJobsDone: totalJobsDone || 0,
      totalRatings: totalRatings || 0,
      avgRating: (Array.isArray(avgRating) && avgRating.length > 0) ? Number(avgRating[0].avg.toFixed(2)) : 0
    };

    res.json({ success: true, stats });

  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ success: false, message: 'Error fetching stats' });
  }
});

/**
 * GET /api/admin/dashboard/live-bookings
 * Get all active bookings with passenger and assistant details
 */
router.get('/live-bookings', async (req, res) => {
  try {
    const { status, station, limit = 50 } = req.query;
    
    const query = {};
    
    if (status) {
      query.status = status;
    } else {
      // Default: show active bookings
      query.status = { $in: ['Pending', 'Searching', 'Assigned', 'Accepted', 'In Progress', 'Emergency'] };
    }
    
    if (station) {
      query.station = station;
    }

    const bookings = await Booking.find(query)
      .populate('passengerId', 'name phone email')
      .populate('assistantId', 'name phone station isOnline rating')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({ success: true, bookings });

  } catch (err) {
    console.error('Live bookings error:', err);
    res.status(500).json({ success: false, message: 'Error fetching bookings' });
  }
});

/**
 * GET /api/admin/dashboard/recent-bookings
 * Get recent completed/cancelled bookings
 */
router.get('/recent-bookings', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const bookings = await Booking.find({
      status: { $in: ['Completed', 'Rejected', 'Cancelled'] }
    })
      .populate('passengerId', 'name phone')
      .populate('assistantId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({ success: true, bookings });

  } catch (err) {
    console.error('Recent bookings error:', err);
    res.status(500).json({ success: false, message: 'Error fetching bookings' });
  }
});

/**
 * GET /api/admin/dashboard/available-assistants
 * Get list of available assistants for manual reassignment
 */
router.get('/available-assistants', async (req, res) => {
  try {
    const { station } = req.query;
    
    const query = {
      applicationStatus: 'Approved',
      isEligibleForBookings: true,
      currentBookingId: null
    };
    
    if (station) {
      query.station = station;
    }

    const assistants = await Assistant.find(query)
      .select('name phone station isOnline rating totalBookingsCompleted languages')
      .sort({ isOnline: -1, rating: -1 })
      .lean();

    res.json({ success: true, assistants });

  } catch (err) {
    console.error('Available assistants error:', err);
    res.status(500).json({ success: false, message: 'Error fetching assistants' });
  }
});

/**
 * POST /api/admin/dashboard/match/:bookingId
 * Trigger matching for a specific booking
 */
router.post('/match/:bookingId', async (req, res) => {
  try {
    const result = await matchAssistant(req.params.bookingId);
    res.json(result);
  } catch (err) {
    console.error('Match error:', err);
    res.status(500).json({ success: false, message: 'Matching failed' });
  }
});

/**
 * POST /api/admin/dashboard/reassign/:bookingId
 * Manually reassign a booking to a different assistant
 */
router.post('/reassign/:bookingId', async (req, res) => {
  try {
    const { assistantId } = req.body;
    
    if (!assistantId) {
      return res.status(400).json({ success: false, message: 'Assistant ID required' });
    }
    
    const result = await reassignBooking(req.params.bookingId, assistantId);
    res.json(result);
    
  } catch (err) {
    console.error('Reassign error:', err);
    res.status(500).json({ success: false, message: 'Reassignment failed' });
  }
});

/**
 * POST /api/admin/dashboard/cancel/:bookingId
 * Cancel a booking
 */
router.post('/cancel/:bookingId', async (req, res) => {
  try {
    const { reason } = req.body;
    
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    
    // Release assistant if assigned
    await releaseAssistant(booking._id);
    
    booking.status = 'Cancelled';
    booking.adminNotes = reason || 'Cancelled by admin';
    await booking.save();
    
    res.json({ success: true, message: 'Booking cancelled', booking });
    
  } catch (err) {
    console.error('Cancel error:', err);
    res.status(500).json({ success: false, message: 'Cancellation failed' });
  }
});

/**
 * POST /api/admin/dashboard/emergency/:bookingId
 * Mark a booking as emergency
 */
router.post('/emergency/:bookingId', async (req, res) => {
  try {
    const { reason } = req.body;
    
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    
    booking.isEmergency = true;
    booking.emergencyMarkedAt = new Date();
    booking.emergencyReason = reason || 'Marked by admin';
    booking.status = 'Emergency';
    await booking.save();
    
    res.json({ success: true, message: 'Booking marked as emergency', booking });
    
  } catch (err) {
    console.error('Emergency mark error:', err);
    res.status(500).json({ success: false, message: 'Failed to mark emergency' });
  }
});

/**
 * GET /api/admin/dashboard/station-stats
 * Get station-wise statistics
 */
router.get('/station-stats', async (req, res) => {
  try {
    const stationStats = await Booking.aggregate([
      {
        $group: {
          _id: '$station',
          totalBookings: { $sum: 1 },
          activeBookings: {
            $sum: {
              $cond: [
                { $in: ['$status', ['Pending', 'Searching', 'Assigned', 'Accepted', 'In Progress']] },
                1,
                0
              ]
            }
          },
          completedBookings: {
            $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] }
          }
        }
      },
      { $sort: { totalBookings: -1 } }
    ]);

    // Get assistant count per station
    const assistantStats = await Assistant.aggregate([
      { $match: { applicationStatus: 'Approved' } },
      {
        $group: {
          _id: '$station',
          totalAssistants: { $sum: 1 },
          onlineAssistants: {
            $sum: { $cond: [{ $eq: ['$isOnline', true] }, 1, 0] }
          }
        }
      }
    ]);

    // Merge stats
    const merged = stationStats.map(station => {
      const assistantData = assistantStats.find(a => a._id === station._id) || {};
      return {
        station: station._id,
        ...station,
        totalAssistants: assistantData.totalAssistants || 0,
        onlineAssistants: assistantData.onlineAssistants || 0
      };
    });

    res.json({ success: true, stationStats: merged });

  } catch (err) {
    console.error('Station stats error:', err);
    res.status(500).json({ success: false, message: 'Error fetching station stats' });
  }
});

/**
 * GET /api/admin/dashboard/top-assistants
 * Get top performing assistants
 */
router.get('/top-assistants', async (req, res) => {
  try {
    const topAssistants = await Assistant.find({
      applicationStatus: 'Approved'
    })
      .select('name phone station rating totalBookingsCompleted totalEarnings isOnline')
      .sort({ totalBookingsCompleted: -1, rating: -1 })
      .limit(10)
      .lean();

    res.json({ success: true, assistants: topAssistants });

  } catch (err) {
    console.error('Top assistants error:', err);
    res.status(500).json({ success: false, message: 'Error fetching assistants' });
  }
});

module.exports = router;
