const db = require('./db');
const Assistant = require('./models/Assistant');
const Booking = require('./models/Booking');
const User = require('./models/User');
const bcrypt = require('bcryptjs');

function genOtp() { return Math.floor(1000 + Math.random() * 9000).toString(); }

async function seed() {
  await db.connect();
  console.log('Connected to DB');

  // Clear existing sample data (be careful in production)
  await Assistant.deleteMany({});
  await Booking.deleteMany({});
  await User.deleteMany({});

  // Create admin user with hashed password
  const adminUser = await User.create({
    name: 'Admin',
    role: 'admin',
    phone: '9999999999',
    password: await bcrypt.hash('admin123', 10)
  });
  console.log('Created admin user: Admin / admin123');

  const assistants = await Assistant.create([
    { name: 'Ravi', station: 'Secunderabad', languages: ['Telugu','Hindi'], verified: true, documents: { aadhar: 'A111', pan: 'P111' } },
    { name: 'Sita', station: 'Kacheguda', languages: ['Hindi','English'], verified: false, documents: { aadhar: 'A222', pan: 'P222' } }
  ]);

  console.log('Created assistants:', assistants.map(a=>a.name).join(','));

  const bookings = [
    {
      passengerName: 'Vikas', station: 'Secunderabad', trainName: 'Express 101', coach: 'B1', seat: '12',
      services: ['Luggage'], language: 'Telugu', status: 'Pending', otp: genOtp()
    },
    {
      passengerName: 'Asha', station: 'Kacheguda', trainName: 'Local 22', coach: 'S2', seat: '45',
      services: ['Language'], language: 'Hindi', status: 'Pending', otp: genOtp()
    },
    {
      passengerName: 'Rahul', station: 'Secunderabad', trainName: 'Express 101', coach: 'B2', seat: '06',
      services: ['Luggage','Language'], language: 'English', status: 'Accepted', otp: genOtp(), assistantId: assistants[0]._id
    }
  ];

  const created = await Booking.create(bookings);
  console.log('Created bookings:', created.map(b=>b.passengerName).join(','));

  console.log('Seed complete. Admin login: Admin / admin123');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
