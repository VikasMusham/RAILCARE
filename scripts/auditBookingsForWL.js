// Script to print all bookings for WL (Warangal) and their statuses
const mongoose = require('mongoose');
const Booking = require('../backend/models/Booking');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/railmitra';

(async () => {
  await mongoose.connect(MONGO_URI);
  const bookings = await Booking.find({ $or: [ { stationCode: 'WL' }, { pickupStationCode: 'WL' }, { dropStationCode: 'WL' } ] });
  if (!bookings.length) {
    console.log('No bookings found for WL (Warangal).');
  } else {
    bookings.forEach(b => {
      console.log(`Booking ID: ${b._id}\n  Status: ${b.status}\n  stationCode: ${b.stationCode}\n  pickupStationCode: ${b.pickupStationCode}\n  dropStationCode: ${b.dropStationCode}\n  Assistant: ${b.assistantId}\n`);
    });
  }
  await mongoose.disconnect();
})();
