/**
 * Scheduling Configuration
 * 
 * Centralized configuration for the scheduling system.
 * All buffer times, thresholds, and operational parameters are defined here.
 * 
 * Based on real-world logistics patterns from:
 * - Indian Railways operational guidelines
 * - Porter/Dunzo delivery scheduling
 * - Airport ground handling protocols
 */

module.exports = {
  // ==================== BUFFER TIMES ====================
  buffer: {
    // Default buffer in minutes (assistant arrives before train)
    default: 20,
    
    // Minimum allowed buffer
    min: 10,
    
    // Maximum allowed buffer
    max: 90,
    
    // Station-type specific buffers
    byStationType: {
      junction: 30,      // Major junctions (multiple platforms)
      terminal: 25,      // Terminal stations (crowded)
      regular: 20,       // Regular stations
      halt: 15           // Small halt stations
    },
    
    // Peak hour adjustment (added to base buffer)
    peakHourAddition: 10,
    
    // Peak hours definition (24-hour format)
    peakHours: [
      { start: 7, end: 10 },   // Morning rush
      { start: 17, end: 21 }   // Evening rush
    ],
    
    // Special day buffers (festivals, holidays)
    specialDayAddition: 15
  },
  
  // ==================== TRAIN DELAY HANDLING ====================
  trainDelay: {
    // How often to check for train delays (ms)
    pollIntervalMs: 5 * 60 * 1000, // 5 minutes
    
    // Threshold to trigger reschedule (minutes)
    rescheduleThresholdMinutes: 15,
    
    // Maximum delay before marking as "uncertain"
    maxTrackableDelayMinutes: 180,
    
    // Auto-cancel if delay exceeds (minutes)
    autoCancelDelayMinutes: 360,
    
    // Sources for live train data (priority order)
    dataSources: [
      { name: 'NTES', priority: 1, enabled: true },
      { name: 'RailYatri', priority: 2, enabled: false },
      { name: 'WhereIsMyTrain', priority: 3, enabled: false }
    ]
  },
  
  // ==================== TASK ASSIGNMENT ====================
  assignment: {
    // Maximum attempts to find an assistant
    maxAttempts: 5,
    
    // Delay between retry attempts (ms)
    retryDelayMs: 30 * 1000, // 30 seconds
    
    // How far ahead to look for tasks (hours)
    lookAheadHours: 4,
    
    // Maximum tasks per assistant at once
    maxTasksPerAssistant: 2,
    
    // Minimum gap between tasks for same assistant (minutes)
    minGapBetweenTasksMinutes: 30,
    
    // Auto-assign vs manual assignment threshold
    // Tasks within this time are auto-assigned
    autoAssignWithinMinutes: 120
  },
  
  // ==================== NOTIFICATIONS ====================
  notifications: {
    // When to send first reminder to assistant (minutes before)
    firstReminderMinutes: 60,
    
    // When to send urgent reminder (minutes before)
    urgentReminderMinutes: 30,
    
    // When to escalate if assistant not confirmed (minutes before)
    escalationMinutes: 20,
    
    // Notify passenger of assistant ETA
    passengerETAEnabled: true
  },
  
  // ==================== OPERATIONAL WINDOWS ====================
  operational: {
    // Service hours (24-hour format)
    serviceHours: {
      start: 4,  // 4 AM
      end: 24    // Midnight
    },
    
    // Minimum advance booking time (minutes)
    minAdvanceBookingMinutes: 60,
    
    // Maximum advance booking time (days)
    maxAdvanceBookingDays: 30,
    
    // Task expiry if not started (minutes after scheduled time)
    taskExpiryMinutes: 60
  },
  
  // ==================== SLA DEFINITIONS ====================
  sla: {
    // Assistant must arrive within this window (minutes)
    arrivalWindowMinutes: 10,
    
    // Task must be completed within (minutes from start)
    maxTaskDurationMinutes: 45,
    
    // Response time for assignment (seconds)
    assignmentResponseSeconds: 120,
    
    // Penalties
    lateArrivalPenaltyPercent: 10,
    noShowPenaltyPercent: 100
  },
  
  // ==================== CAPACITY PLANNING ====================
  capacity: {
    // Target tasks per assistant per shift
    targetTasksPerShift: 8,
    
    // Maximum concurrent tasks at a station
    maxConcurrentTasksPerStation: 10,
    
    // Buffer capacity percentage (extra assistants)
    bufferCapacityPercent: 20
  }
};
