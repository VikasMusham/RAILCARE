const mongoose = require('mongoose');

const trainStopSchema = new mongoose.Schema({
  trainId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Train',
    required: true,
    index: true
  },
  trainNumber: {
    type: String,
    required: true,
    index: true
  },
  stopSequence: {
    type: Number,
    required: true
  },
  stationCode: {
    type: String,
    required: true,
    index: true
  },
  stationName: {
    type: String,
    required: true,
    index: true
  },
  routeNumber: {
    type: Number,
    default: 1
  },
  arrivalTime: {
    type: String,
    default: null
  },
  departureTime: {
    type: String,
    default: null
  },
  distance: {
    type: Number,
    default: 0
  },
  // Fare classes (in INR)
  fares: {
    firstAC: { type: Number, default: 0 },    // 1A
    secondAC: { type: Number, default: 0 },   // 2A
    thirdAC: { type: Number, default: 0 },    // 3A
    sleeper: { type: Number, default: 0 }     // SL
  }
}, { timestamps: true });

// Compound index for efficient queries
trainStopSchema.index({ trainId: 1, stopSequence: 1 });
trainStopSchema.index({ trainNumber: 1, stopSequence: 1 });
trainStopSchema.index({ stationCode: 1, trainNumber: 1 });

// Text index for station search
trainStopSchema.index({ stationName: 'text', stationCode: 'text' });

module.exports = mongoose.model('TrainStop', trainStopSchema);
