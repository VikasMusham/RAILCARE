const mongoose = require('mongoose');
const IncidentSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', index: true },
  timeline: [String],
  notes: String,
  resolution: String,
  assignedAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Incident', IncidentSchema);
