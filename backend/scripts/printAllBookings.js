// Script to print all bookings and their statuses for debugging
const mongoose = require('mongoose');
const Booking = require('../models/Booking');

async function main() {
  await mongoose.connect('mongodb://localhost:27017/railmitra', { useNewUrlParser: true, useUnifiedTopology: true });
  const bookings = await Booking.find({}).sort({ createdAt: -1 });
  if (!bookings.length) {
    console.log('No bookings found.');
  } else {
    bookings.forEach(b => {
      console.log(`${b._id} | ${b.passengerName} | ${b.status}`);
    });
    console.log(`\nTotal bookings: ${bookings.length}`);
  }
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
