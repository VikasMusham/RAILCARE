// printAllBookingStatuses.js
// Usage: node printAllBookingStatuses.js

const mongoose = require('mongoose');
const Booking = require('./models/Booking');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/railmitra';

async function main() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const bookings = await Booking.find({}, { status: 1, passengerName: 1, station: 1 });
  if (!bookings.length) {
    console.log('No bookings found.');
    process.exit(0);
  }
  console.log('Booking statuses:');
  bookings.forEach(b => {
    console.log(`- ${b._id}: status="${b.status}" passenger="${b.passengerName}" station="${b.station}"`);
  });
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
