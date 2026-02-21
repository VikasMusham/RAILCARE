// Script to seed test bookings with all possible statuses for admin filter testing
const mongoose = require('mongoose');
const Booking = require('../models/Booking');

const statuses = [
  'Pending',
  'Searching',
  'Assigned',
  'Accepted',
  'Start Pending',
  'In Progress',
  'Completion Pending',
  'Completed',
  'Rejected',
  'Cancelled',
  'Emergency'
];

async function main() {
  await mongoose.connect('mongodb://localhost:27017/railmitra', { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');

  // Remove old test bookings
  await Booking.deleteMany({ passengerName: /^Test Filter/ });

  // Create one booking for each status
  const bookings = statuses.map((status, i) => ({
    passengerName: `Test Filter ${status}`,
    station: 'KCG',
    trainName: 'Test Express',
    coach: 'S1',
    seat: `${i+1}`,
    services: ['LUGGAGE'],
    language: 'English',
    price: 100 + i,
    status,
    paymentStatus: 'Paid',
    createdAt: new Date(Date.now() - i * 1000000)
  }));

  await Booking.insertMany(bookings);
  console.log('Seeded test bookings for all statuses');
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
