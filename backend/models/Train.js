const mongoose = require('mongoose');

const trainSchema = new mongoose.Schema({
  trainNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  trainName: {
    type: String,
    required: true,
    index: true
  },
  sourceStation: {
    type: String,
    required: true
  },
  destinationStation: {
    type: String,
    required: true
  },
  runningDays: {
    type: [String],
    default: []
  },
  type: {
    type: String,
    enum: ['Superfast', 'Express', 'Mail', 'Passenger', 'Rajdhani', 'Shatabdi', 'Duronto', 'Garib Rath', 'Jan Shatabdi', 'Humsafar', 'Tejas', 'Vande Bharat', 'Special', 'Local', 'Unknown'],
    default: 'Express'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  totalStops: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

// Create text index for efficient searching
trainSchema.index({ trainName: 'text', trainNumber: 'text' });
trainSchema.index({ sourceStation: 1 });
trainSchema.index({ destinationStation: 1 });

module.exports = mongoose.model('Train', trainSchema);
