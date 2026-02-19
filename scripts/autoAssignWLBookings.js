// Script to auto-assign all pending/searching bookings for Warangal (WL) to eligible assistant
const mongoose = require('mongoose');
const Booking = require('../backend/models/Booking');
const Assistant = require('../backend/models/Assistant');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/railmitra';

async function main() {
  await mongoose.connect(MONGO_URI);
  const assistant = await Assistant.findOne({ stationCode: 'WL', verified: true, applicationStatus: 'Approved', isEligibleForBookings: true, revoked: false });
  if (!assistant) {
    console.log('No eligible assistant for WL');
    await mongoose.disconnect();
    return;
  }
  const bookings = await Booking.find({ stationCode: 'WL', status: { $in: ['Pending', 'Searching'] }, assistantId: null });
  let assigned = 0;
  for (const b of bookings) {
    b.assistantId = assistant._id;
    b.status = 'Accepted';
    await b.save();
    assigned++;
    console.log('Assigned booking:', b._id);
  }
  console.log('Total assigned:', assigned);
  await mongoose.disconnect();
}

main().catch(console.error);
