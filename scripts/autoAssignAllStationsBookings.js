// Generic script to auto-assign all pending/searching bookings for ALL stations to eligible assistants
const mongoose = require('mongoose');
const Booking = require('../backend/models/Booking');
const Assistant = require('../backend/models/Assistant');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/railmitra';

async function main() {
  await mongoose.connect(MONGO_URI);
  // Find all station names with pending/searching bookings
  const stations = await Booking.distinct('stationName', { status: { $in: ['Pending', 'Searching'] }, assistantId: null });
  let totalAssigned = 0;
  for (const station of stations) {
    // Find eligible assistant for this station name (case-insensitive)
    const assistant = await Assistant.findOne({ stationName: { $regex: new RegExp('^' + station + '$', 'i') }, verified: true, applicationStatus: 'Approved', isEligibleForBookings: true, revoked: false });
    if (!assistant) {
      console.log(`No eligible assistant for station ${station}`);
      continue;
    }
    const bookings = await Booking.find({ stationName: { $regex: new RegExp('^' + station + '$', 'i') }, status: { $in: ['Pending', 'Searching'] }, assistantId: null });
    let assigned = 0;
    for (const b of bookings) {
      b.assistantId = assistant._id;
      b.status = 'Accepted';
      await b.save();
      assigned++;
      console.log(`Assigned booking ${b._id} to assistant ${assistant.name} at station ${station}`);
    }
    console.log(`Total assigned for station ${station}:`, assigned);
    totalAssigned += assigned;
  }
  console.log('Total assigned across all stations:', totalAssigned);
  await mongoose.disconnect();
}

main().catch(console.error);
