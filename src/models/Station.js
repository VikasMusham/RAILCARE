const mongoose = require('mongoose');

const StationSchema = new mongoose.Schema({
  station_name: { type: String, required: true },
  station_code: { type: String, required: true, unique: true, index: true },
});

// Always store station_code as uppercase trimmed
StationSchema.pre('save', function(next) {
  if (this.station_code) {
    this.station_code = this.station_code.trim().toUpperCase();
  }
  next();
});

module.exports = mongoose.model('Station', StationSchema);
