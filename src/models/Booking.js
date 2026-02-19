const mongoose = require('mongoose');
const bookingStatuses = [
  'SEARCHING', 'ASSIGNED', 'ASSISTANT_EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EMERGENCY'
];
const BookingSchema = new mongoose.Schema({
  passengerName: { type: String, required: true },
  passengerPhone: String,
  passengerEmail: String,
  boarding_station_code: { type: String, required: true, index: true }, // normalized
  arrival_station_code: { type: String, required: true, index: true }, // normalized
  assistantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assistant', index: true },
  status: { type: String, enum: bookingStatuses, index: true, default: 'SEARCHING' },
  price: Number,
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
  emergency: { type: Boolean, default: false }
});
BookingSchema.index({ status: 1 });
BookingSchema.index({ assistantId: 1 });
BookingSchema.index({ boarding_station_code: 1 });
BookingSchema.index({ arrival_station_code: 1 });
BookingSchema.index({ createdAt: 1 });

// Always store station codes as uppercase trimmed
BookingSchema.pre('save', function(next) {
  if (this.boarding_station_code) {
    this.boarding_station_code = this.boarding_station_code.trim().toUpperCase();
  }
  if (this.arrival_station_code) {
    this.arrival_station_code = this.arrival_station_code.trim().toUpperCase();
  }
  next();
});

module.exports = mongoose.model('Booking', BookingSchema);
