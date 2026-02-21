const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Assistant = require('../models/Assistant');
const ServiceTask = require('../models/ServiceTask');
const { authenticate, authorize, SECRET } = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const { matchAssistant, releaseAssistant } = require('../services/matchingService');
const {
  createServiceTasks, 
  validateServiceType, 
  getServiceTypeAvailability,
  cancelBookingTasks 
} = require('../services/schedulingService');
const {
  validateLuggageInput,
  validateMultiLuggageInput,
  calculateTotalPrice,
  calculateMultiLuggageCost,
  getLuggageDisplayString,
  LUGGAGE_PRICES
} = require('../services/pricingService');

// Update passenger phone for a booking
router.post('/:id/update-phone', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || phone.trim() === '') {
      return res.status(400).json({ success: false, message: 'Phone number required.' });
    }
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
    booking.passengerPhone = phone;
    await booking.save();
    // Optionally update user profile if linked
    if (booking.userId) {
      const User = require('../models/User');
      await User.findByIdAndUpdate(booking.userId, { phone });
    }
    return res.json({ success: true, booking });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ========== RESEND OTP ENDPOINTS ========== 
// Resend Start OTP
router.post('/:id/resend-start-otp', async (req, res) => {
  try {
    const { assistantId } = req.body || {};
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    // Only allow if booking is in Start Pending or Accepted
    if (!['Start Pending', 'Accepted'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: `Cannot resend Start OTP - booking status is: ${booking.status}` });
    }
    // Verify assistant is assigned
    if (assistantId && booking.assistantId && booking.assistantId.toString() !== assistantId.toString()) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this booking' });
    }
    // Generate and save new Start OTP
    const startOtp = genOtp();
    booking.startOtp = startOtp;
    booking.status = 'Start Pending';
    await booking.save();
    // In production, send OTP to passenger via SMS/notification
    res.json({ success: true, message: 'Start OTP resent to passenger.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Resend Completion OTP
router.post('/:id/resend-complete-otp', async (req, res) => {
  try {
    const { assistantId } = req.body || {};
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    // Only allow if booking is in Completion Pending
    if (booking.status !== 'Completion Pending') {
      return res.status(400).json({ success: false, message: `Cannot resend Completion OTP - booking status is: ${booking.status}` });
    }
    // Verify assistant is assigned
    if (assistantId && booking.assistantId && booking.assistantId.toString() !== assistantId.toString()) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this booking' });
    }
    // Generate and save new Completion OTP
    const completionOtp = genOtp();
    booking.completionOtp = completionOtp;
    await booking.save();
    // In production, send OTP to passenger via SMS/notification
    res.json({ success: true, message: 'Completion OTP resent to passenger.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


function genOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Create booking - with automatic matching and service task scheduling
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    const otp = genOtp();
    
    // Try to get userId from JWT token if provided
    let userId = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const payload = jwt.verify(token, SECRET);
        userId = payload.id;
      } catch (e) {
        // Token invalid or expired, continue without userId
      }
    }
    
    // Validate service type if train and station are provided
    // Fallback mapper for backward compatibility
    let serviceType = data.serviceType || 'pickup';
    const legacyMap = {
      'ESCORT': 'pickup',
      'LUGGAGE': 'drop',
      'FULL_ASSIST': 'round_trip'
    };
    if (legacyMap[serviceType]) serviceType = legacyMap[serviceType];
    
    // ==================== LUGGAGE VALIDATION (SERVER-SIDE) ====================
    // Supports BOTH legacy (single size/quantity) AND new multi-luggage cart
    let luggageItems = [];
    let totalLuggageCost = 0;
    let legacyLuggageSize = 'none';
    let legacyLuggageQuantity = 0;
    
    // Check for new multi-luggage cart system
    if (Array.isArray(data.luggageItems) && data.luggageItems.length > 0) {
      const multiValidation = validateMultiLuggageInput(data.luggageItems);
      if (!multiValidation.valid) {
        return res.status(400).json({
          success: false,
          errors: multiValidation.errors,
          message: multiValidation.errors.join('. ')
        });
      }
      
      // Process validated luggage items with pricing
      const luggageCalc = calculateMultiLuggageCost(multiValidation.sanitized);
      luggageItems = luggageCalc.items;
      totalLuggageCost = luggageCalc.totalCost;
      
      // For backward compatibility, set legacy fields from first item or totals
      if (luggageItems.length === 1) {
        legacyLuggageSize = luggageItems[0].type;
        legacyLuggageQuantity = luggageItems[0].quantity;
      } else if (luggageItems.length > 0) {
        // Multiple types - set legacy to 'none' to indicate using new system
        legacyLuggageSize = 'none';
        legacyLuggageQuantity = luggageItems.reduce((sum, item) => sum + item.quantity, 0);
      }
    } else {
      // LEGACY: Single size/quantity validation
      const luggageValidation = validateLuggageInput(data.luggageSize, data.luggageQuantity);
      if (!luggageValidation.valid) {
        return res.status(400).json({
          success: false,
          errors: luggageValidation.errors,
          message: luggageValidation.errors.join('. ')
        });
      }
      legacyLuggageSize = luggageValidation.sanitized.size;
      legacyLuggageQuantity = luggageValidation.sanitized.quantity;
    }
    
    // Calculate price server-side (NEVER trust frontend price)
    const priceCalc = calculateTotalPrice({
      services: data.services || [],
      luggageSize: legacyLuggageSize,
      luggageQuantity: legacyLuggageQuantity,
      luggageItems: luggageItems,  // NEW: multi-luggage support
      serviceType: serviceType,
      includeInsurance: data.insurance === true
    });
    // ==================== END LUGGAGE VALIDATION ====================
    
    // For round trip: validate both pickup and drop stations separately
    if (serviceType === 'round_trip' && data.trainNumber) {
      if (!data.pickupStationCode || !data.dropStationCode) {
        return res.status(400).json({
          success: false,
          errors: ['Round trip requires both pickup and drop station'],
          message: 'Please select both pickup station and drop station for round trip service.'
        });
      }
      
      // Validate pickup station (must allow pickup)
      const pickupValidation = await validateServiceType(
        data.trainNumber,
        data.pickupStationCode,
        'pickup'
      );
      if (!pickupValidation.valid) {
        return res.status(400).json({
          success: false,
          errors: pickupValidation.errors,
          message: `Pickup station: ${pickupValidation.errors.join('. ')}`
        });
      }
      
      // Validate drop station (must allow drop)
      const dropValidation = await validateServiceType(
        data.trainNumber,
        data.dropStationCode,
        'drop'
      );
      if (!dropValidation.valid) {
        return res.status(400).json({
          success: false,
          errors: dropValidation.errors,
          message: `Drop station: ${dropValidation.errors.join('. ')}`
        });
      }
      
    } else if (data.trainNumber && data.stationCode) {
      // For pickup/drop: validate single station
      const validation = await validateServiceType(
        data.trainNumber,
        data.stationCode,
        serviceType
      );
      
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          errors: validation.errors,
          message: validation.errors.join('. ')
        });
      }
    }
    
    // Create booking with enhanced fields
    let passengerPhone = data.passengerPhone;
    if (!passengerPhone && userId) {
      const User = require('../models/User');
      const user = await User.findById(userId);
      if (user && user.phone) passengerPhone = user.phone;
    }
    if (!passengerPhone || passengerPhone.trim() === '') {
      return res.status(400).json({ success: false, message: 'Passenger phone number is required.' });
    }
    const booking = new Booking({ 
      ...data, 
      otp, 
      status: 'Pending',
      userId: userId,
      passengerPhone: passengerPhone,
      passengerEmail: data.passengerEmail,
      trainNumber: data.trainNumber,
      stationCode: data.stationCode,
      // Separate station codes for round trip
      pickupStationCode: data.pickupStationCode || (serviceType === 'pickup' ? data.stationCode : ''),
      pickupStationName: data.pickupStationName || (serviceType === 'pickup' ? data.station : ''),
      dropStationCode: data.dropStationCode || (serviceType === 'drop' ? data.stationCode : ''),
      dropStationName: data.dropStationName || (serviceType === 'drop' ? data.station : ''),
      serviceType: serviceType,
      preferredLanguages: data.preferredLanguages || (data.language ? [data.language] : []),
      arrivalTime: data.arrivalTime,
      passengerNotes: data.passengerNotes,
      // Luggage - validated and sanitized server-side
      // LEGACY fields (for backward compatibility)
      luggageSize: legacyLuggageSize,
      luggageQuantity: legacyLuggageQuantity,
      luggageCost: priceCalc.luggageCost,
      // NEW: Multi-luggage cart items
      luggageItems: luggageItems,
      totalLuggageCost: priceCalc.luggageCost,
      // Price - calculated server-side, NEVER from frontend
      price: priceCalc.total
    });
    await booking.save();
    
    // Create service tasks if train and station are provided
    let serviceTasks = [];
    const canCreateTasks = data.trainNumber && (
      data.stationCode || 
      (serviceType === 'round_trip' && data.pickupStationCode && data.dropStationCode)
    );
    
    if (canCreateTasks) {
      const taskResult = await createServiceTasks(booking, {
        forceBuffer: data.bufferMinutes || null
      });
      
      if (!taskResult.success) {
        console.warn('[Booking] Service task creation had issues:', taskResult.errors);
      }
      serviceTasks = taskResult.tasks;
    }
    
    let matchResult = { success: false };
    if (serviceType === 'round_trip' && serviceTasks && serviceTasks.length > 0) {
      // For each service task (pickup/drop), match assistant for the correct station
      for (const task of serviceTasks) {
        const best = await require('../services/matchingService').findBestAssistant(booking, task.stationCode);
        if (best && best.assistant) {
          console.log(`[Booking] Assigning assistant ${best.assistant.name} (${best.assistant._id}) to task ${task._id} at station ${task.stationCode}`);
          // Assign assistant to the task and update status/timestamp
          await require('../models/ServiceTask').findByIdAndUpdate(
            task._id,
            {
              assignedAssistant: best.assistant._id,
              status: 'assigned',
              assignedAt: new Date()
            }
          );
        } else {
          console.log(`[Booking] No assistant assigned for task ${task._id} at station ${task.stationCode}`);
        }
      }
      matchResult.success = true;
    } else {
      // Default: match for the main booking
      matchResult = await matchAssistant(booking._id);
    }

    // Return the updated booking and tasks
    const saved = await Booking.findById(booking._id).populate('assistantId');
    const updatedTasks = await require('../models/ServiceTask').find({ bookingId: booking._id });
    res.json({ 
      success: true, 
      booking: saved, 
      serviceTasks: updatedTasks,
      message: matchResult.success 
        ? `Booking created! Assistant(s) matched.`
        : 'Booking created. Searching for an assistant...',
      matched: matchResult.success
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get my bookings - for logged in passenger
router.get('/my-bookings', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    
    const token = authHeader.split(' ')[1];
    let payload;
    try {
      payload = jwt.verify(token, SECRET);
    } catch (e) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    
    const User = require('../models/User');
    const user = await User.findById(payload.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Search by userId OR phone number (to find bookings made before userId was implemented)
    const query = {
      $or: [
        { userId: payload.id },
        { passengerPhone: user.phone }
      ]
    };
    
    // If phone is empty, only search by userId
    if (!user.phone) {
      delete query.$or;
      query.userId = payload.id;
    }
    
    const bookings = await Booking.find(query)
      .sort({ createdAt: -1 })
      .populate('assistantId');
    
    res.json({ success: true, bookings });
  } catch (err) {
    console.error('Error fetching my bookings:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== PRICING PREVIEW API ====================
// Get price calculation without creating a booking
// Frontend calls this to show accurate price breakdown
// Supports BOTH legacy (single size/qty) AND new multi-luggage cart
router.post('/preview-price', async (req, res) => {
  try {
    const { services, luggageSize, luggageQuantity, luggageItems, serviceType, insurance } = req.body;
    
    // Determine which luggage system to use
    let processedItems = [];
    let legacySize = 'none';
    let legacyQty = 0;
    
    if (Array.isArray(luggageItems) && luggageItems.length > 0) {
      // NEW: Multi-luggage cart
      const multiValidation = validateMultiLuggageInput(luggageItems);
      processedItems = multiValidation.sanitized;
    } else {
      // LEGACY: Single size/quantity
      const luggageValidation = validateLuggageInput(luggageSize, luggageQuantity);
      legacySize = luggageValidation.sanitized.size;
      legacyQty = luggageValidation.sanitized.quantity;
    }
    
    // Calculate price
    const priceCalc = calculateTotalPrice({
      services: services || [],
      luggageSize: legacySize,
      luggageQuantity: legacyQty,
      luggageItems: processedItems,
      serviceType: serviceType || 'pickup',
      includeInsurance: insurance === true
    });
    
    // Return breakdown for UI display
    res.json({
      success: true,
      breakdown: priceCalc.breakdown,
      luggageCost: priceCalc.luggageCost,
      subtotal: priceCalc.subtotal,
      total: priceCalc.total,
      luggageMode: processedItems.length > 0 ? 'multi' : 'legacy',
      luggageValid: true
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// Get bookings (filter by station, status, passenger info)
router.get('/', async (req, res) => {
  const { station, status, passengerName, passengerPhone, userId } = req.query;
  const q = {};
  if (station) q.station = station;
  if (status) q.status = status;
  if (passengerName) q.passengerName = { $regex: passengerName, $options: 'i' };
  if (passengerPhone) q.passengerPhone = passengerPhone;
  if (userId) q.userId = userId;
  
  let list = await Booking.find(q).sort({ createdAt: -1 }).populate('assistantId');
  // Always attach passengerPhone from user profile if possible
  const User = require('../models/User');
  list = await Promise.all(list.map(async (b) => {
    let bookingObj = b.toObject ? b.toObject() : b;
    // Always attach passengerPhone from user profile if missing
    if ((!bookingObj.passengerPhone || bookingObj.passengerPhone.trim() === '') && bookingObj.userId) {
      const user = await User.findById(bookingObj.userId);
      if (user && user.phone) bookingObj.passengerPhone = user.phone;
    }
    // Fallback: try to attach phone from passengerProfile, passengerId, or other fields
    if (!bookingObj.passengerPhone || bookingObj.passengerPhone.trim() === '') {
      if (bookingObj.passengerProfile && bookingObj.passengerProfile.phone) bookingObj.passengerPhone = bookingObj.passengerProfile.phone;
      else if (bookingObj.passengerId && bookingObj.passengerId.phone) bookingObj.passengerPhone = bookingObj.passengerId.phone;
      else if (bookingObj.phone) bookingObj.passengerPhone = bookingObj.phone;
    }
    // Attach assistant rating and bookings completed
    if (bookingObj.assistantId) {
      const Assistant = require('../models/Assistant');
      const assistant = await Assistant.findById(bookingObj.assistantId);
      bookingObj.assistantRating = assistant && assistant.rating ? assistant.rating : 0;
      bookingObj.assistantBookings = assistant && assistant.totalBookingsCompleted ? assistant.totalBookingsCompleted : 0;
    }
    return bookingObj;
  }));
  res.json(list);
});


// Get booking by id
router.get('/:id', async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('assistantId');
    if (!booking) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, booking });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Assistant accepts booking
// Accept if a verified `assistantId` is provided (allows the assistant portal flow without JWT).
router.post('/:id/accept', async (req, res) => {
  try {
    const { assistantId } = req.body || {};
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Not found' });
    
    // Allow accepting bookings that are Pending, Searching, or Assigned (for manual acceptance)
    const acceptableStatuses = ['Pending', 'Searching', 'Assigned'];
    if (!acceptableStatuses.includes(booking.status)) {
      return res.status(400).json({ success: false, message: `Cannot accept booking with status: ${booking.status}` });
    }

    if (!assistantId) {
      return res.status(400).json({ success: false, message: 'assistantId required to accept' });
    }

    const assistant = await Assistant.findById(assistantId);
    if (!assistant) return res.status(404).json({ success: false, message: 'Assistant not found' });
    if (!assistant.verified) return res.status(403).json({ success: false, message: 'Assistant not verified' });

    console.log('[booking:accept] assistantId=', assistantId, 'bookingId=', booking._id);
    booking.status = 'Accepted';
    booking.assistantId = assistantId;
    await booking.save();
    
    // Update assistant - mark as busy
    await Assistant.findByIdAndUpdate(assistantId, {
      currentBookingId: booking._id
    });
    
    const saved = await Booking.findById(booking._id).populate('assistantId');
    console.log('[booking:accept] saved status=', saved.status);
    res.json({ success: true, booking: saved });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Assistant starts service - generates Start OTP sent to passenger
router.post('/:id/start', async (req, res) => {
  try {
    const { assistantId } = req.body || {};
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    
    // Can only start if status is Accepted
    if (booking.status !== 'Accepted') {
      return res.status(400).json({ success: false, message: `Cannot start service - booking status is: ${booking.status}` });
    }
    
    // Verify this assistant is assigned to the booking
    if (assistantId && booking.assistantId && booking.assistantId.toString() !== assistantId.toString()) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this booking' });
    }
    
    // Generate Start OTP
    const startOtp = genOtp();
    booking.startOtp = startOtp;
    booking.status = 'Start Pending';
    await booking.save();
    
    const saved = await Booking.findById(booking._id).populate('assistantId');
    console.log('[booking:start] Generated Start OTP for booking', booking._id, 'OTP=', startOtp);
    
    // In production, send OTP to passenger via SMS/notification
    // OTP is stored in booking and shown to passenger when they poll
    res.json({ 
      success: true, 
      booking: saved, 
      message: 'Start OTP sent to passenger. Please ask passenger for the OTP.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Verify Start OTP - move to In Progress
router.post('/:id/verify-start-otp', async (req, res) => {
  try {
    const { otp, assistantId } = req.body || {};
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    
    if (booking.status !== 'Start Pending') {
      return res.status(400).json({ success: false, message: 'Booking is not awaiting start verification' });
    }
    
    // Normalize OTPs
    const incomingDigits = String(otp || '').replace(/\D/g, '').trim();
    const storedDigits = String(booking.startOtp || '').replace(/\D/g, '').trim();
    
    console.log('[booking:verify-start-otp] incoming=', incomingDigits, 'stored=', storedDigits);
    
    if (!storedDigits) {
      return res.status(400).json({ success: false, message: 'No Start OTP set for this booking' });
    }
    
    if (incomingDigits !== storedDigits) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }
    
    // Verify assistant
    if (assistantId && booking.assistantId && booking.assistantId.toString() !== assistantId.toString()) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this booking' });
    }
    
    booking.status = 'In Progress';
    booking.startOtp = null; // Clear after use
    booking.startedAt = new Date();
    await booking.save();
    
    const saved = await Booking.findById(booking._id).populate('assistantId');
    console.log('[booking:verify-start-otp] Service started for booking', booking._id);
    
    res.json({ success: true, booking: saved, message: 'Service started successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Assistant rejects booking
// Reject a booking. If `assistantId` is provided and matches booking, unassign and reopen (Pending).
router.post('/:id/reject', async (req, res) => {
  try {
    const { assistantId } = req.body || {};
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false });
    
    if (assistantId && booking.assistantId && booking.assistantId.toString() === assistantId.toString()) {
      // Assistant rejects an assignment: unassign and reopen for other assistants
      console.log('[booking:reject] assistant rejected assignment assistantId=', assistantId, 'bookingId=', booking._id, 'oldStatus=', booking.status);
      booking.assistantId = null;
      booking.status = 'Pending';
      // clear any OTPs since assignment changed
      booking.completionOtp = null;
      await booking.save();
      const saved = await Booking.findById(booking._id).populate('assistantId');
      console.log('[booking:reject] reopened booking status=', saved.status);
      return res.json({ success: true, message: 'Booking unassigned and reopened', booking: saved });
    }

    // Otherwise treat as admin/system rejection
    booking.status = 'Rejected';
    await booking.save();
    res.json({ success: true, booking });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});


// Verify OTP (assistant enters otp) -> move to In Progress
// Accept either a verified assistantId in body (demo flow) or a valid assistant JWT
router.post('/:id/verify-otp', async (req, res) => {
  try {
    const { otp, assistantId } = req.body || {};
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false });
    // normalize OTPs to digits-only and trim to avoid whitespace/type issues
    const incomingRaw = otp == null ? '' : String(otp);
    const storedRaw = booking.otp == null ? '' : String(booking.otp);
    const incomingDigits = incomingRaw.replace(/\D/g, '').trim();
    const storedDigits = storedRaw.replace(/\D/g, '').trim();
    console.log('[booking:verify-otp] incomingRaw=', JSON.stringify(incomingRaw), 'storedRaw=', JSON.stringify(storedRaw), 'incomingDigits=', incomingDigits, 'storedDigits=', storedDigits, 'bookingId=', req.params.id, 'assistantId(body)=', assistantId);
    if (!storedDigits) return res.status(400).json({ success: false, message: 'No OTP set for this booking' });
    if (incomingDigits !== storedDigits) return res.status(400).json({ success: false, message: 'Invalid OTP' });

    // authorize: either assistantId provided and matches booking.assistantId and assistant is verified,
    // or Authorization header contains a valid assistant JWT
    let authorized = false;
    if (assistantId) {
      const assistant = await Assistant.findById(assistantId);
      if (!assistant) return res.status(404).json({ success: false, message: 'Assistant not found' });
      if (!assistant.verified) return res.status(403).json({ success: false, message: 'Assistant not verified' });
      if (!booking.assistantId || booking.assistantId.toString() !== assistantId.toString()) {
        return res.status(400).json({ success: false, message: 'Booking not assigned to this assistant' });
      }
      authorized = true;
    } else {
      const h = req.headers['authorization'];
      if (!h) return res.status(401).json({ success: false, message: 'Missing auth token' });
      const parts = h.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ success: false, message: 'Invalid auth header' });
      try {
        const payload = jwt.verify(parts[1], SECRET);
        if (payload.role !== 'assistant') return res.status(403).json({ success: false, message: 'Forbidden' });
        // optional: ensure payload.id matches booking.assistantId
        if (booking.assistantId && booking.assistantId.toString() !== payload.id) return res.status(400).json({ success: false, message: 'Booking not assigned to this assistant' });
        authorized = true;
      } catch (err) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
      }
    }

    if (!authorized) return res.status(403).json({ success: false, message: 'Forbidden' });

    booking.status = 'In Progress';
    // clear the start OTP after successful verification
    booking.otp = null;
    await booking.save();
    res.json({ success: true, booking });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});




// Assistant requests completion: generate completion OTP and set status to 'Completion Pending'
// Allow assistantId in body (demo) or assistant JWT
router.post('/:id/complete-request', async (req, res) => {
  try {
    function genOtp() { return Math.floor(1000 + Math.random() * 9000).toString(); }
    const { assistantId } = req.body || {};
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status !== 'In Progress') return res.status(400).json({ success: false, message: 'Booking not in progress' });

    let authorized = false;
    if (assistantId) {
      const assistant = await Assistant.findById(assistantId);
      if (!assistant) return res.status(404).json({ success: false, message: 'Assistant not found' });
      if (!assistant.verified) return res.status(403).json({ success: false, message: 'Assistant not verified' });
      if (!booking.assistantId || booking.assistantId.toString() !== assistantId.toString()) return res.status(400).json({ success: false, message: 'Booking not assigned to this assistant' });
      authorized = true;
    } else {
      const h = req.headers['authorization'];
      if (!h) return res.status(401).json({ success: false, message: 'Missing auth token' });
      const parts = h.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ success: false, message: 'Invalid auth header' });
      try {
        const payload = jwt.verify(parts[1], SECRET);
        if (payload.role !== 'assistant') return res.status(403).json({ success: false, message: 'Forbidden' });
        if (booking.assistantId && booking.assistantId.toString() !== payload.id) return res.status(400).json({ success: false, message: 'Booking not assigned to this assistant' });
        authorized = true;
      } catch (err) { return res.status(401).json({ success: false, message: 'Invalid token' }); }
    }

    if (!authorized) return res.status(403).json({ success: false, message: 'Forbidden' });

    const completionOtp = genOtp();
    booking.completionOtp = completionOtp;
    booking.status = 'Completion Pending';
    await booking.save();
    
    console.log('[booking:complete-request] Generated Completion OTP for booking', booking._id, 'OTP=', completionOtp);
    
    // In production, send OTP to passenger via SMS/notification
    // OTP is stored in booking and shown to passenger when they poll
    res.json({ 
      success: true, 
      message: 'Completion OTP sent to passenger'
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Passenger confirms completion by entering completionOtp -> set status to Completed
router.post('/:id/confirm-completion', async (req, res) => {
  try {
    const { otp, assistantId } = req.body || {};
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status !== 'Completion Pending') return res.status(400).json({ success: false, message: 'Booking not awaiting completion confirmation' });

    // Allow either passenger (authenticated) or assistant (demo flow via assistantId) to confirm by providing the correct completion OTP
    let authorized = false;
    // assistant path
    if (assistantId) {
      const assistant = await Assistant.findById(assistantId);
      if (!assistant) return res.status(404).json({ success: false, message: 'Assistant not found' });
      if (!assistant.verified) return res.status(403).json({ success: false, message: 'Assistant not verified' });
      if (!booking.assistantId || booking.assistantId.toString() !== assistantId.toString()) return res.status(400).json({ success: false, message: 'Booking not assigned to this assistant' });
      authorized = true;
    } else {



      // passenger auth path
      const h = req.headers['authorization'];
      if (!h) return res.status(401).json({ success: false, message: 'Missing auth token' });
      const parts = h.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ success: false, message: 'Invalid auth header' });
      try {
        const payload = jwt.verify(parts[1], SECRET);
        if (payload.role !== 'passenger') return res.status(403).json({ success: false, message: 'Forbidden' });
        authorized = true;
      } catch (err) { return res.status(401).json({ success: false, message: 'Invalid token' }); }
    }

    if (!authorized) return res.status(403).json({ success: false, message: 'Forbidden' });

    const incomingRawC = otp == null ? '' : String(otp);
    const storedRawC = booking.completionOtp == null ? '' : String(booking.completionOtp);
    const incomingDigitsC = incomingRawC.replace(/\D/g, '').trim();
    const storedDigitsC = storedRawC.replace(/\D/g, '').trim();
    console.log('[booking:confirm-completion] incomingRaw=', JSON.stringify(incomingRawC), 'storedRaw=', JSON.stringify(storedRawC), 'incomingDigits=', incomingDigitsC, 'storedDigits=', storedDigitsC, 'bookingId=', req.params.id, 'assistantId(body)=', assistantId);
    if (storedDigitsC && incomingDigitsC === storedDigitsC) {
      booking.status = 'Completed';
      // clear completionOtp
      booking.completionOtp = null;
      await booking.save();
      // Update assistant's totalBookingsCompleted
      if (booking.assistantId) {
        const Assistant = require('../models/Assistant');
        await Assistant.findByIdAndUpdate(
          booking.assistantId,
          { $inc: { totalBookingsCompleted: 1 } }
        );
      }
      return res.json({ success: true });
    }
    res.status(400).json({ success: false, message: 'Invalid completion OTP' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Admin or system: assign assistant to booking
router.post('/:id/assign', async (req, res) => {
  try {
    const { assistantId } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) return res.status(404).json({ success: false, message: 'Assistant not found' });
    if (!assistant.verified) return res.status(400).json({ success: false, message: 'Assistant not verified' });
    booking.assistantId = assistantId;
    booking.status = 'Accepted';
    await booking.save();
    res.json({ success: true, booking });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Admin: update booking fields
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const allowed = ['passengerName','station','trainName','coach','seat','services','language','price','status','assistantId'];
    const data = req.body || {};
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    for (const k of allowed) {
      if (data[k] !== undefined) booking[k] = data[k];
    }
    // if assistantId provided, validate assistant
    if (data.assistantId) {
      const assistant = await Assistant.findById(String(data.assistantId));
      if (!assistant) return res.status(404).json({ success: false, message: 'Assistant not found' });
      if (!assistant.verified) return res.status(400).json({ success: false, message: 'Assistant not verified' });
      booking.assistantId = assistant._id;
    }
    await booking.save();
    const saved = await Booking.findById(booking._id).populate('assistantId');
    res.json({ success: true, booking: saved });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Admin: cancel a booking
router.post('/:id/cancel', authenticate, authorize('admin'), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    booking.status = 'Rejected';
    booking.assistantId = null;
    booking.otp = null;
    booking.completionOtp = null;
    await booking.save();
    
    // Cancel associated service tasks
    await cancelBookingTasks(booking._id);
    
    res.json({ success: true, booking });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

/**
 * GET /api/bookings/:id/tasks
 * Get service tasks for a booking
 */
router.get('/:id/tasks', async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    
    const tasks = await ServiceTask.find({ bookingId: booking._id })
      .sort({ taskSequence: 1 })
      .lean();
    
    return res.json({
      success: true,
      bookingId: booking._id,
      serviceType: booking.serviceType,
      tasks,
      totalTasks: tasks.length
    });
  } catch (err) {
    console.error('[booking:tasks] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

