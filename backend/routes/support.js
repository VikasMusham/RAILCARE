const express = require('express');
const router = express.Router();
const SupportTicket = require('../models/SupportTicket');
const { authenticate, authorize } = require('../middleware/auth');

// ==================== PASSENGER ENDPOINTS ====================

// POST /api/support/escalate — Create a new support ticket (passenger)
router.post('/escalate', async (req, res) => {
  try {
    const { passengerName, issueTrail, chatHistory, timestamp } = req.body;
    
    const ticketId = 'RM' + Date.now().toString().slice(-6);
    
    // Determine priority from issue trail
    let priority = 'medium';
    const trail = (issueTrail || '').toLowerCase();
    if (trail.includes('noshow') || trail.includes('missed') || trail.includes('not show') || trail.includes('rude')) {
      priority = 'urgent';
    } else if (trail.includes('pay') || trail.includes('deducted') || trail.includes('refund')) {
      priority = 'high';
    } else if (trail.includes('feedback') || trail.includes('receipt')) {
      priority = 'low';
    }

    // Determine category from first item in chatHistory
    let issueCategory = '';
    if (chatHistory && chatHistory.length > 0) {
      const catMap = {
        booking: 'Previous Booking Issue',
        payment: 'Payment Issue',
        assistant: 'Assistant / Service Issue',
        newBooking: 'New Booking Help',
        station: 'Station / Meeting Point Help',
        refund: 'Refund / Cancellation',
        support: 'General Support'
      };
      for (const h of chatHistory) {
        if (catMap[h]) { issueCategory = catMap[h]; break; }
      }
    }

    // Extract user info from token if present
    let userId = null;
    let email = '';
    let phone = '';
    try {
      const authHeader = req.headers['authorization'];
      if (authHeader) {
        const jwt = require('jsonwebtoken');
        const SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET.trim() !== '' ? process.env.JWT_SECRET : 'railcare_secret_key';
        const token = authHeader.split(' ')[1];
        const payload = jwt.verify(token, SECRET);
        userId = payload.id || payload._id || null;
        email = payload.email || '';
        phone = payload.phone || '';
      }
    } catch(e) { /* token optional */ }

    const ticket = new SupportTicket({
      ticketId,
      userId,
      passengerName: passengerName || 'Guest',
      passengerEmail: email,
      passengerPhone: phone,
      issueCategory,
      issueTrail: issueTrail || '',
      chatHistory: chatHistory || [],
      priority,
      status: 'open'
    });

    await ticket.save();
    console.log(`[Support] New ticket created: ${ticketId} — ${passengerName} — ${issueTrail}`);

    res.json({ 
      success: true, 
      ticketId, 
      message: 'Support ticket created successfully' 
    });
  } catch (err) {
    console.error('[Support] Escalation error:', err);
    res.status(500).json({ success: false, message: 'Failed to create support ticket' });
  }
});

// GET /api/support/my-tickets — Get tickets for logged-in user
router.get('/my-tickets', authenticate, async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json({ success: true, tickets });
  } catch (err) {
    console.error('[Support] My tickets error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
});

// POST /api/support/tickets-by-ids — Get tickets by their IDs (for guest users with local ticket IDs)
router.post('/tickets-by-ids', async (req, res) => {
  try {
    const { ticketIds } = req.body;
    if (!ticketIds || !Array.isArray(ticketIds) || !ticketIds.length) {
      return res.json({ success: true, tickets: [] });
    }
    // Limit to 20 IDs max
    const ids = ticketIds.slice(0, 20);
    const tickets = await SupportTicket.find({ ticketId: { $in: ids } })
      .sort({ createdAt: -1 })
      .select('ticketId passengerName issueCategory issueTrail chatHistory status priority adminResponse resolvedAt createdAt');
    res.json({ success: true, tickets });
  } catch (err) {
    console.error('[Support] Tickets by IDs error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
});

// POST /api/support/followup — Add a follow-up message to a ticket
router.post('/followup', async (req, res) => {
  try {
    const { ticketId, message } = req.body;
    if (!ticketId || !message) {
      return res.status(400).json({ success: false, message: 'ticketId and message required' });
    }
    const ticket = await SupportTicket.findOne({ ticketId });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    // Append to chatHistory — support both passenger and admin messages
    if (message.startsWith('Admin: ')) {
      ticket.chatHistory.push(message);
    } else {
      ticket.chatHistory.push('Passenger follow-up: ' + message);
      // If ticket was resolved/closed, reopen it (only for passenger follow-ups)
      if (ticket.status === 'resolved' || ticket.status === 'closed') {
        ticket.status = 'open';
      }
    }
    await ticket.save();
    console.log(`[Support] Follow-up added to ${ticketId}: ${message.substring(0, 50)}`);
    res.json({ success: true, message: 'Follow-up added' });
  } catch (err) {
    console.error('[Support] Follow-up error:', err);
    res.status(500).json({ success: false, message: 'Failed to add follow-up' });
  }
});

// ==================== ADMIN ENDPOINTS ====================

// GET /api/support/tickets — Get all tickets (admin only)
router.get('/tickets', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { status, priority, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    const total = await SupportTicket.countDocuments(filter);
    const tickets = await SupportTicket.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Stats
    const stats = {
      total: await SupportTicket.countDocuments(),
      open: await SupportTicket.countDocuments({ status: 'open' }),
      inProgress: await SupportTicket.countDocuments({ status: 'in-progress' }),
      resolved: await SupportTicket.countDocuments({ status: 'resolved' }),
      closed: await SupportTicket.countDocuments({ status: 'closed' }),
      urgent: await SupportTicket.countDocuments({ priority: 'urgent', status: { $in: ['open', 'in-progress'] } }),
      high: await SupportTicket.countDocuments({ priority: 'high', status: { $in: ['open', 'in-progress'] } })
    };

    res.json({ success: true, tickets, total, stats });
  } catch (err) {
    console.error('[Support] List tickets error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
});

// PUT /api/support/tickets/:ticketId — Update ticket (admin)
router.put('/tickets/:ticketId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { status, priority, adminNotes, adminResponse } = req.body;
    const update = {};
    if (status) update.status = status;
    if (priority) update.priority = priority;
    if (adminNotes !== undefined) update.adminNotes = adminNotes;
    if (adminResponse !== undefined) update.adminResponse = adminResponse;
    
    if (status === 'resolved') {
      update.resolvedBy = req.user.id;
      update.resolvedAt = new Date();
    }

    const ticket = await SupportTicket.findOneAndUpdate(
      { ticketId: req.params.ticketId },
      { $set: update },
      { new: true }
    );

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    console.log(`[Support] Ticket ${req.params.ticketId} updated by admin: ${JSON.stringify(update)}`);
    res.json({ success: true, ticket });
  } catch (err) {
    console.error('[Support] Update ticket error:', err);
    res.status(500).json({ success: false, message: 'Failed to update ticket' });
  }
});

// DELETE /api/support/tickets/:ticketId — Delete ticket (admin)
router.delete('/tickets/:ticketId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const ticket = await SupportTicket.findOneAndDelete({ ticketId: req.params.ticketId });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    console.log(`[Support] Ticket ${req.params.ticketId} deleted by admin`);
    res.json({ success: true, message: 'Ticket deleted' });
  } catch (err) {
    console.error('[Support] Delete ticket error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete ticket' });
  }
});

module.exports = router;
