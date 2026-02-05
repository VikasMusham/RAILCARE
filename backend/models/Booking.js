const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  passengerName: { type: String, required: true },
  passengerPhone: { type: String, default: '' },
  passengerEmail: { type: String, default: '' },
  station: { type: String, required: true },
  stationCode: { type: String, default: '' },
  
  // Separate station codes for round trip service
  pickupStationCode: { type: String, default: '' },
  pickupStationName: { type: String, default: '' },
  dropStationCode: { type: String, default: '' },
  dropStationName: { type: String, default: '' },
  
  trainName: { type: String },
  trainNumber: { type: String, default: '' },
  coach: { type: String },
  seat: { type: String },
  services: [String],
  language: { type: String },
  preferredLanguages: [{ type: String }],
  arrivalTime: { type: Date, default: null },
  
  // Luggage Details - for pricing and assistant preparation
  // LEGACY FIELDS (kept for backward compatibility with existing bookings)
  luggageSize: { 
    type: String, 
    enum: ['none', 'small', 'medium', 'large'], 
    default: 'none' 
  },
  luggageQuantity: { 
    type: Number, 
    default: 0, 
    min: 0, 
    max: 8,
    validate: {
      validator: Number.isInteger,
      message: '{VALUE} is not a valid luggage quantity'
    }
  },
  luggageCost: { type: Number, default: 0 }, // Calculated server-side
  
  // NEW: Multi-luggage cart system (one booking → many luggage items)
  // Takes precedence over legacy fields if populated
  luggageItems: [{
    type: {
      type: String,
      enum: ['small', 'medium', 'large'],
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not a valid quantity'
      }
    },
    pricePerUnit: { type: Number, default: 0 },
    totalPrice: { type: Number, default: 0 }
  }],
  // Total luggage cost (sum of all luggageItems OR legacy luggageCost)
  totalLuggageCost: { type: Number, default: 0 },
  
  // Service Type: determines assistant workflow
  serviceType: { 
    type: String, 
    enum: ['pickup', 'drop', 'round_trip'], 
    default: 'pickup'
  },
  
  // Booking Status
  status: { 
    type: String, 
    enum: ['Pending', 'Searching', 'Assigned', 'Accepted', 'Start Pending', 'In Progress', 'Completion Pending', 'Completed', 'Rejected', 'Cancelled', 'Emergency'], 
    default: 'Pending' 
  },
  
  // Assistant Assignment
  assistantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assistant', default: null },
  assignedAt: { type: Date, default: null },
  matchScore: { type: Number, default: 0 },
  matchAttempts: { type: Number, default: 0 },
  
  // Payment
  price: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Refunded', 'Failed'], default: 'Pending' },
  paymentMethod: { type: String, default: '' },
  transactionId: { type: String, default: '' },
  
  // OTPs
  otp: { type: String },
  startOtp: { type: String },
  completionOtp: { type: String },
  
  // Emergency
  isEmergency: { type: Boolean, default: false },
  emergencyMarkedAt: { type: Date, default: null },
  emergencyReason: { type: String, default: '' },
  
  // Notes
  passengerNotes: { type: String, default: '' },
  adminNotes: { type: String, default: '' },
  
  // Feedback tracking
  hasFeedback: { type: Boolean, default: false }
}, { timestamps: true });

// Indexes for fast queries
BookingSchema.index({ status: 1, station: 1 });
BookingSchema.index({ assistantId: 1, status: 1 });
BookingSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Booking', BookingSchema);
