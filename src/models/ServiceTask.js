const mongoose = require('mongoose');
const ServiceTaskSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  taskType: { type: String, enum: ['pickup', 'drop'], required: true },
  station: { type: String, required: true, index: true }, // station name (case-insensitive)
  assignedAssistant: { type: mongoose.Schema.Types.ObjectId, ref: 'Assistant' },
  status: { type: String, enum: ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], default: 'PENDING' }
});

// Always store station name as trimmed
ServiceTaskSchema.pre('save', function(next) {
  if (this.station) {
    this.station = this.station.trim();
  }
  next();
});

module.exports = mongoose.model('ServiceTask', ServiceTaskSchema);
