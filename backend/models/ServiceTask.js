/**
 * ServiceTask Model
 * 
 * Represents individual tasks that an assistant must perform for a booking.
 * One booking can have multiple service tasks (e.g., round_trip = pickup + drop).
 * 
 * This model handles:
 * - Task scheduling based on train arrival times
 * - Assistant action tracking
 * - Service window management
 */

const mongoose = require('mongoose');

const ServiceTaskSchema = new mongoose.Schema({
  // Reference to parent booking
  bookingId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Booking', 
    required: true,
    index: true
  },
  
  // Task type: what kind of service
  taskType: { 
    type: String, 
    enum: ['pickup', 'drop'], 
    required: true
  },
  
  // Station where service is performed
  stationCode: { 
    type: String, 
    required: true,
    index: true
  },
  
  // Train information for scheduling
  trainNumber: {
    type: String,
    required: true,
    index: true
  },
  
  // Service window: when assistant should act relative to train
  // before_arrival: Assistant arrives BEFORE train to prepare (both types)
  // after_arrival: Service happens AFTER train halts (both boarding & deboarding)
  // Note: PICKUP = Boarding (help passenger board), DROP = Deboarding (help passenger exit)
  serviceWindow: { 
    type: String, 
    enum: ['before_arrival', 'after_arrival'], 
    required: true
  },
  
  // What the assistant must do
  assistantAction: { 
    type: String, 
    required: true
  },
  
  // When assistant should arrive at platform
  // For both pickup and drop: arrivalTime - buffer
  assistantArrivalTime: {
    type: Date,
    default: null
  },
  
  // When the train arrives (from train_stops)
  trainArrivalTime: {
    type: String,
    default: null
  },
  
  // When the train departs (from train_stops)
  trainDepartureTime: {
    type: String,
    default: null
  },
  
  // Scheduled time for task execution
  // For pickup: same as assistantArrivalTime
  // For drop: trainArrivalTime (when train halts)
  scheduledTime: { 
    type: Date, 
    default: null
  },
  
  // Task status
  status: { 
    type: String, 
    enum: ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'], 
    default: 'pending',
    index: true
  },
  
  // Sequence for round trips (1 = first task, 2 = second task)
  taskSequence: {
    type: Number,
    default: 1
  },
  
  // Stop sequence from train_stops (for validation)
  stopSequence: {
    type: Number,
    default: null
  },
  
  // Buffer time in minutes (intelligently calculated)
  bufferMinutes: {
    type: Number,
    default: 20
  },
  
  // Reason for buffer time (for audit and optimization)
  bufferReason: {
    type: String,
    default: 'default'
  },
  
  // Assigned assistant details
  assignedAssistant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assistant',
    default: null
  },
  
  assignedAt: {
    type: Date,
    default: null
  },
  
  // Task completion details
  completedAt: {
    type: Date,
    default: null
  },
  
  // Notes or special instructions
  notes: {
    type: String,
    default: ''
  }
}, { 
  timestamps: true 
});

// Compound indexes for efficient queries
ServiceTaskSchema.index({ bookingId: 1, taskSequence: 1 });
ServiceTaskSchema.index({ stationCode: 1, status: 1, scheduledTime: 1 });
ServiceTaskSchema.index({ trainNumber: 1, stationCode: 1 });
ServiceTaskSchema.index({ status: 1, scheduledTime: 1 });

// Virtual for checking if task is past due
ServiceTaskSchema.virtual('isPastDue').get(function() {
  if (!this.scheduledTime) return false;
  return new Date() > this.scheduledTime && this.status === 'pending';
});

// Instance method to mark as completed
ServiceTaskSchema.methods.complete = function() {
  this.status = 'completed';
  this.completedAt = new Date();
  return this.save();
};

// Static method to get pending tasks for a station
ServiceTaskSchema.statics.getPendingForStation = function(stationCode, limit = 50) {
  return this.find({
    stationCode,
    status: { $in: ['pending', 'assigned'] }
  })
  .sort({ scheduledTime: 1 })
  .limit(limit)
  .populate('bookingId');
};

// Static method to get tasks for a booking
ServiceTaskSchema.statics.getForBooking = function(bookingId) {
  return this.find({ bookingId })
    .sort({ taskSequence: 1 });
};

module.exports = mongoose.model('ServiceTask', ServiceTaskSchema);
