const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  passengerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  passengerName: { type: String },
  passengerPhone: { type: String },
  assistantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assistant' },
  assistantName: { type: String },
  station: { type: String },
  
  // Ratings (1-5 stars)
  assistantRating: { type: Number, min: 1, max: 5, required: true },
  appRating: { type: Number, min: 1, max: 5, required: true },
  
  // Text feedback
  assistantFeedback: { type: String },
  appFeedback: { type: String },
  
  // Legacy field for backward compatibility
  rating: { type: Number, min: 1, max: 5 },
  comments: { type: String },
  
  // Additional fields
  wouldRecommend: { type: Boolean },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Feedback', FeedbackSchema);
