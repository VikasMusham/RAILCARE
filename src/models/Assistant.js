const mongoose = require('mongoose');
const AssistantSchema = new mongoose.Schema({
  name: String,
  isAvailable: { type: Boolean, default: true, index: true },
  station: { type: String, required: true, index: true }, // station name (case-insensitive)
  geoLocation: { type: { type: String, default: 'Point' }, coordinates: [Number] },
  skills: [String],
  maxCapacity: Number,
  languages: [String],
  reliabilityScore: Number,
  rating: Number,
  completedBookings: Number,
  cancellationRate: Number,
  availabilityStatus: { type: String, default: 'active', index: true },
  verified: { type: Boolean, default: false },
  documents: {
    aadhar: String,
    pan: String,
    photo: String
  }
});
AssistantSchema.index({ isAvailable: 1 });
AssistantSchema.index({ station: 1 });
AssistantSchema.index({ geoLocation: '2dsphere' });

// Always store station name as trimmed
AssistantSchema.pre('save', function(next) {
  if (this.station) {
    this.station = this.station.trim();
  }
  next();
});

module.exports = mongoose.model('Assistant', AssistantSchema);
