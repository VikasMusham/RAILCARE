const db = require('./db');
const Assistant = require('./models/Assistant');
const Booking = require('./models/Booking');

async function clear() {
  await db.connect();
  console.log('Connected to DB');

  const a = await Assistant.deleteMany({});
  const b = await Booking.deleteMany({});

  console.log('Deleted assistants:', a.deletedCount);
  console.log('Deleted bookings:', b.deletedCount);
  console.log('Clear complete.');
  process.exit(0);
}

clear().catch(err => { console.error(err); process.exit(1); });
