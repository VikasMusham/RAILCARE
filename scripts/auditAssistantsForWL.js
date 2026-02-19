// Script to print all available assistants for WL (Warangal)
const mongoose = require('mongoose');
const Assistant = require('../backend/models/Assistant');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/railmitra';

(async () => {
  await mongoose.connect(MONGO_URI);
  const assistants = await Assistant.find({
    stationCode: 'WL',
    verified: true,
    applicationStatus: 'Approved',
    isEligibleForBookings: true,
    revoked: { $ne: true }
  });
  if (!assistants.length) {
    console.log('No available assistants for WL (Warangal).');
  } else {
    assistants.forEach(a => {
      console.log(`Assistant: ${a.name}\n  ID: ${a._id}\n  Verified: ${a.verified}\n  Status: ${a.applicationStatus}\n  Eligible: ${a.isEligibleForBookings}\n  Online: ${a.isOnline}\n  Current Booking: ${a.currentBookingId}\n`);
    });
  }
  await mongoose.disconnect();
})();
