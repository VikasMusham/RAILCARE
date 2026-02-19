
/**
 * Service Task Scheduling Service
 * 
 * Production-grade scheduling logic for assistant tasks.
 * Handles:
 * - Task creation based on service type
 * - Schedule calculation using train arrival times
 * - Validation of station position (first/last stop)
 * - Buffer time management
 * - Dynamic buffer calculation based on station type and time
 * 
 * CRITICAL OPERATIONAL LOGIC:
 * - Pickup (Boarding): Assistant arrives BEFORE train, helps passenger BOARD when train arrives
 * - Drop (Arrival): Assistant arrives BEFORE train, helps passenger DEBOARD and exit after train halts
 * - Both require assistant to be ready BEFORE train arrival
 * 
 * SERVICE DIRECTION DEFINITIONS:
 * - PICKUP = Boarding Assistance: Platform → Train (passenger STARTS journey)
 * - DROP = Arrival Assistance: Train → Platform (passenger ENDS journey)
 */

const ServiceTask = require('../models/ServiceTask');
const TrainStop = require('../models/TrainStop');
const Train = require('../models/Train');

// Load configuration
let schedulingConfig;
try {
  schedulingConfig = require('../config/scheduling.config');
} catch (e) {
  // Fallback defaults if config not found
  schedulingConfig = {
    buffer: { default: 20, min: 10, max: 60, peakHourAddition: 10, peakHours: [] },
    trainDelay: { rescheduleThresholdMinutes: 15 },
    assignment: { lookAheadHours: 4 }
  };
}

// Configurable buffer times (from config)
const DEFAULT_BUFFER_MINUTES = schedulingConfig.buffer?.default || 20;
const MIN_BUFFER_MINUTES = schedulingConfig.buffer?.min || 10;
const MAX_BUFFER_MINUTES = schedulingConfig.buffer?.max || 60;

// Assistant action descriptions - CORRECT DIRECTIONS
const ASSISTANT_ACTIONS = {
  pickup: 'Meet passenger at platform, help with luggage, guide to correct coach, assist boarding (Platform → Train)',
  drop: 'Arrive before train, identify coach, help passenger deboard, assist with luggage, guide to exit (Train → Platform)'
};

/**
 * Check if a given hour is within peak hours
 * @param {number} hour - Hour in 24-hour format
 * @returns {boolean}
 */
function isPeakHour(hour) {
  const peakHours = schedulingConfig.buffer?.peakHours || [];
  return peakHours.some(p => hour >= p.start && hour < p.end);
}

/**
 * Calculate intelligent buffer based on context
 * @param {Object} options - Context for buffer calculation
 * @returns {number} Buffer in minutes
 */
function calculateIntelligentBuffer(options = {}) {
  const { 
    stationType = 'regular',
    scheduledTime = new Date(),
    isSpecialDay = false,
    requestedBuffer = null
  } = options;

  // Start with station-type specific buffer
  const stationBuffers = schedulingConfig.buffer?.byStationType || {};
  let buffer = stationBuffers[stationType] || DEFAULT_BUFFER_MINUTES;

  // If explicit buffer requested, use it (within limits)
  if (requestedBuffer !== null) {
    buffer = requestedBuffer;
  }

  // Add peak hour buffer
  const hour = scheduledTime.getHours();
  if (isPeakHour(hour)) {
    buffer += schedulingConfig.buffer?.peakHourAddition || 10;
  }

  // Add special day buffer (festivals, holidays)
  if (isSpecialDay) {
    buffer += schedulingConfig.buffer?.specialDayAddition || 15;
  }

  // Clamp to min/max
  return Math.max(MIN_BUFFER_MINUTES, Math.min(buffer, MAX_BUFFER_MINUTES));
}

/**
 * Parse time string (HH:MM or HH:MM:SS) to Date object for today
 * @param {string} timeStr - Time string like "14:30" or "14:30:00"
 * @param {Date} baseDate - Base date to use (defaults to today)
 * @returns {Date|null} Date object or null if invalid
 */
function parseTimeToDate(timeStr, baseDate = new Date()) {
  if (!timeStr || timeStr === 'null' || timeStr === 'None') return null;
  
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;
  
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  
  if (isNaN(hours) || isNaN(minutes)) return null;
  
  const result = new Date(baseDate);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

/**
 * Calculate assistant arrival time (before train arrival)
 * @param {Date} trainArrivalDate - When train arrives
 * @param {number} bufferMinutes - How many minutes before train arrival
 * @returns {Date} When assistant should arrive
 */
function calculateAssistantArrivalTime(trainArrivalDate, bufferMinutes = DEFAULT_BUFFER_MINUTES) {
  if (!trainArrivalDate) return null;
  
  const buffer = Math.max(MIN_BUFFER_MINUTES, Math.min(bufferMinutes, MAX_BUFFER_MINUTES));
  const arrivalTime = new Date(trainArrivalDate);
  arrivalTime.setMinutes(arrivalTime.getMinutes() - buffer);
  return arrivalTime;
}

/**
 * Detect station type based on station code patterns
 * Used for intelligent buffer calculation
 * @param {string} stationCode 
 * @param {string} stationName 
 * @returns {string} Station type: 'junction', 'terminal', 'halt', 'regular'
 */
function detectStationType(stationCode, stationName = '') {
  const code = stationCode.toUpperCase();
  const name = (stationCode || stationName || '').toUpperCase();
  if (name.includes('JN') || name.includes('JUNCTION')) return 'junction';
  if (name.includes('TERMINAL') || name.includes('TERMINUS')) return 'terminal';
  if (name.includes('HALT') || name.includes('H.')) return 'halt';
  return 'regular';
    if (name.includes('TERMINAL') || name.includes('TERMINUS')) return 'terminal';
    if (name.includes('HALT') || name.includes('H.')) return 'halt';
    return 'regular';
}

/**
 * Get stop metadata for a train at a specific station
 * @param {string} trainNumber 
 * @param {string} stationCode 
 * @returns {Object} Stop data with position info
 */
async function getStopMetadata(trainNumber, stationCode) {
  // Get the specific stop by station code
  const stop = await TrainStop.findOne({ 
    trainNumber, 
    stationCode: stationCode 
  }).lean();
  
  if (!stop) {
    return { found: false, error: 'Station not found on this train route' };
  }
  
  // Get total stops for this train to determine first/last
  const totalStops = await TrainStop.countDocuments({ trainNumber });
  
  // Get first and last stop sequences
  const [firstStop, lastStop] = await Promise.all([
    TrainStop.findOne({ trainNumber }).sort({ stopSequence: 1 }).select('stopSequence stationName').lean(),
    TrainStop.findOne({ trainNumber }).sort({ stopSequence: -1 }).select('stopSequence stationName').lean()
  ]);
  
  // Detect station type
  const stationType = detectStationType(stop.stationName);
  
  return {
    found: true,
    stop,
    totalStops,
    stationType,
    isFirstStop: stop.stopSequence === firstStop?.stopSequence,
    isLastStop: stop.stopSequence === lastStop?.stopSequence,
    stopSequence: stop.stopSequence,
    firstStopSequence: firstStop?.stopSequence,
    lastStopSequence: lastStop?.stopSequence
  };
}

/**
 * Validate if a service type is allowed for a given station on a train route
 * @param {string} trainNumber 
 * @param {string} stationCode 
 * @param {string} serviceType - 'pickup', 'drop', or 'round_trip'
 * @returns {Object} { valid: boolean, errors: string[], metadata: Object }
 */
async function validateServiceType(trainNumber, stationCode, serviceType) {
  const errors = [];
  
  // Validate inputs
  if (!trainNumber || !stationCode || !serviceType) {
    return { 
      valid: false, 
      errors: ['Train number, station code, and service type are required'],
      metadata: null
    };
  }
  
  // Validate service type enum
  const validTypes = ['pickup', 'drop', 'round_trip'];
  if (!validTypes.includes(serviceType)) {
    return { 
      valid: false, 
      errors: [`Invalid service type. Must be one of: ${validTypes.join(', ')}`],
      metadata: null
    };
  }
  
  // Get stop metadata
  const metadata = await getStopMetadata(trainNumber, stationCode);
  
  if (!metadata.found) {
    return { 
      valid: false, 
      errors: [metadata.error],
      metadata: null
    };
  }
  
  // Validation rules based on stop position
  // PICKUP = Boarding (Platform → Train) - passenger STARTS journey
  // DROP = Arrival (Train → Platform) - passenger ENDS journey
  
  // Rule 1: Cannot PICKUP (board) at LAST stop - train terminates here, no boarding
  if (metadata.isLastStop && (serviceType === 'pickup' || serviceType === 'round_trip')) {
    errors.push('Boarding assistance (Pickup) is not available at the terminal station. The train ends here - no passengers can board.');
  }
  
  // Rule 2: Cannot DROP (arrive/exit) at FIRST stop - train originates here, no arrivals
  if (metadata.isFirstStop && (serviceType === 'drop' || serviceType === 'round_trip')) {
    errors.push('Arrival assistance (Drop) is not available at the origin station. The train starts here - no passengers arriving.');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    metadata
  };
}

/**
 * Create service tasks for a booking
 * Uses intelligent buffer calculation based on station type and conditions
 * For round_trip: Creates separate pickup and drop tasks at different stations
 * @param {Object} booking - The booking document
 * @param {Object} options - Optional configuration
 * @returns {Object} { success: boolean, tasks: Array, errors: Array }
 */
async function createServiceTasks(booking, options = {}) {
  const { 
    baseDate = new Date(),
    forceBuffer = null // Override intelligent calculation if specified
  } = options;
  
  const errors = [];
  const tasks = [];
  
  // Validate required booking fields
  if (!booking.trainNumber || !booking.serviceType) {
    return {
      success: false,
      tasks: [],
      errors: ['Booking must have trainNumber and serviceType']
    };
  }
  
  // For round_trip: require both pickup and drop station codes
  // For pickup/drop: require stationCode OR the specific station code
  if (booking.serviceType === 'round_trip') {
    if (!booking.pickupStationCode || !booking.dropStationCode) {
      return {
        success: false,
        tasks: [],
        errors: ['Round trip requires both pickupStationCode and dropStationCode']
      };
    }
  } else if (!booking.stationCode && 
             (booking.serviceType === 'pickup' && !booking.pickupStationCode) &&
             (booking.serviceType === 'drop' && !booking.dropStationCode)) {
    return {
      success: false,
      tasks: [],
      errors: ['Booking must have stationCode']
    };
  }
  
  // Build task configurations based on service type
  const taskConfigs = [];
  
  if (booking.serviceType === 'pickup') {
    // Single pickup task
    const station = booking.pickupStation || booking.station;
    const validation = await validateServiceType(booking.trainNumber, station, 'pickup');
    if (!validation.valid) {
      return { success: false, tasks: [], errors: validation.errors };
    }
    taskConfigs.push({
      taskType: 'pickup',
      station,
      validation,
      taskSequence: 1
    });
  } else if (booking.serviceType === 'drop') {
    // Single drop task
    const station = booking.dropStation || booking.station;
    const validation = await validateServiceType(booking.trainNumber, station, 'drop');
    if (!validation.valid) {
      return { success: false, tasks: [], errors: validation.errors };
    }
    taskConfigs.push({
      taskType: 'drop',
      station,
      validation,
      taskSequence: 1
    });
  } else if (booking.serviceType === 'round_trip') {
    // Two tasks at different stations
    // Validate pickup station
    const pickupValidation = await validateServiceType(
      booking.trainNumber, 
      booking.pickupStation, 
      'pickup'
    );
    if (!pickupValidation.valid) {
      errors.push(`Pickup station: ${pickupValidation.errors.join(', ')}`);
    } else {
      taskConfigs.push({
        taskType: 'pickup',
        station: booking.pickupStation,
        validation: pickupValidation,
        taskSequence: 1
      });
    }
    // Validate drop station
    const dropValidation = await validateServiceType(
      booking.trainNumber, 
      booking.dropStation, 
      'drop'
    );
    if (!dropValidation.valid) {
      errors.push(`Drop station: ${dropValidation.errors.join(', ')}`);
    } else {
      taskConfigs.push({
        taskType: 'drop',
        station: booking.dropStation,
        validation: dropValidation,
        taskSequence: 2
      });
    }
    // If any validation failed for round trip, return errors
    if (errors.length > 0) {
      return { success: false, tasks: [], errors };
    }
  }
  
  // Create tasks in database
  for (const config of taskConfigs) {
    try {
      const { stop, stationType } = config.validation.metadata;
      const trainArrivalDate = parseTimeToDate(stop.arrivalTime, baseDate);
      // INTELLIGENT BUFFER: Calculate based on station type, peak hours, and conditions
      const intelligentBuffer = forceBuffer || calculateIntelligentBuffer(
        stationType || 'regular',
        trainArrivalDate
      );
      const assistantArrival = calculateAssistantArrivalTime(trainArrivalDate, intelligentBuffer);
      const task = new ServiceTask({
        bookingId: booking._id,
        taskType: config.taskType,
        station: config.station,
        trainNumber: booking.trainNumber,
        // Both boarding (pickup) and deboarding (drop) happen AFTER train arrives
        // Assistant arrives BEFORE train (assistantArrivalTime), service happens AFTER
        serviceWindow: 'after_arrival',
        assistantAction: ASSISTANT_ACTIONS[config.taskType],
        assistantArrivalTime: assistantArrival,
        trainArrivalTime: stop.arrivalTime,
        trainDepartureTime: stop.departureTime,
        scheduledTime: config.taskType === 'pickup' ? assistantArrival : trainArrivalDate,
        taskSequence: config.taskSequence,
        stopSequence: stop.stopSequence,
        bufferMinutes: intelligentBuffer,
        bufferReason: `${stationType || 'regular'} station, ${isPeakHour(trainArrivalDate) ? 'peak' : 'off-peak'} hours`,
        status: 'pending'
      });
      await task.save();
      tasks.push(task);
    } catch (err) {
      errors.push(`Failed to create ${config.taskType} task: ${err.message}`);
    }
  }
  
  return {
    success: errors.length === 0,
    tasks,
    errors
  };
}

/**
 * Get service type availability for a station on a train
 * Returns which service types are allowed
 * @param {string} trainNumber 
 * @param {string} stationCode 
 * @returns {Object} Available service types with reasons
 */
async function getServiceTypeAvailability(trainNumber, stationCode) {
  const metadata = await getStopMetadata(trainNumber, stationCode);
  
  if (!metadata.found) {
    return {
      available: false,
      error: metadata.error,
      pickup: { allowed: false, reason: metadata.error },
      drop: { allowed: false, reason: metadata.error },
      round_trip: { allowed: false, reason: metadata.error }
    };
  }
  
  const result = {
    available: true,
    stationInfo: {
      stationCode: metadata.stop.stationCode,
      stationName: metadata.stop.stationName,
      stationType: metadata.stationType,
      stopSequence: metadata.stopSequence,
      totalStops: metadata.totalStops,
      arrivalTime: metadata.stop.arrivalTime,
      departureTime: metadata.stop.departureTime,
      isFirstStop: metadata.isFirstStop,
      isLastStop: metadata.isLastStop
    },
    pickup: { allowed: true, reason: null },
    drop: { allowed: true, reason: null },
    round_trip: { allowed: true, reason: null }
  };
  
  if (metadata.isFirstStop) {
    result.pickup.allowed = false;
    result.pickup.reason = 'This is the origin station. Pickup is not available.';
    result.round_trip.allowed = false;
    result.round_trip.reason = 'This is the origin station. Round trip requires pickup which is not available here.';
  }
  
  if (metadata.isLastStop) {
    result.drop.allowed = false;
    result.drop.reason = 'This is the terminal station. Drop is not available.';
    result.round_trip.allowed = false;
    result.round_trip.reason = 'This is the terminal station. Round trip requires drop which is not available here.';
  }
  
  return result;
}

/**
 * Cancel all tasks for a booking
 * @param {string} bookingId 
 * @returns {Object} Result
 */
async function cancelBookingTasks(bookingId) {
  const result = await ServiceTask.updateMany(
    { bookingId, status: { $in: ['pending', 'assigned'] } },
    { $set: { status: 'cancelled' } }
  );
  
  return {
    success: true,
    modifiedCount: result.modifiedCount
  };
}

/**
 * Get upcoming tasks for an assistant at a station
 * @param {string} stationCode 
 * @param {number} hoursAhead - How many hours ahead to look
 * @param {number} limit - Max tasks to return
 * @returns {Array} Tasks
 */
async function getUpcomingTasks(station, hoursAhead = 4, limit = 20) {
  const now = new Date();
  const futureLimit = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
  // Case-insensitive station name match
  return ServiceTask.find({
    station: { $regex: new RegExp('^' + station.trim() + '$', 'i') },
    status: { $in: ['pending', 'assigned'] },
    scheduledTime: { $gte: now, $lte: futureLimit }
  })
  .sort({ scheduledTime: 1 })
  .limit(limit)
  .populate('bookingId');
}

module.exports = {
  // Core functions
  createServiceTasks,
  validateServiceType,
  getServiceTypeAvailability,
  cancelBookingTasks,
  getUpcomingTasks,
  
  // Helpers (exported for testing)
  parseTimeToDate,
  calculateAssistantArrivalTime,
  calculateIntelligentBuffer,
  getStopMetadata,
  detectStationType,
  isPeakHour,
  
  // Constants
  DEFAULT_BUFFER_MINUTES,
  MIN_BUFFER_MINUTES,
  MAX_BUFFER_MINUTES,
  ASSISTANT_ACTIONS
};
