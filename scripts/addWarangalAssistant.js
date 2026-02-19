// Script to create a verified assistant for Warangal (WL)
const mongoose = require('mongoose');
const Assistant = require('../backend/models/Assistant');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/railmitra';

async function main() {
  await mongoose.connect(MONGO_URI);
  const existing = await Assistant.findOne({ stationCode: 'WL', name: 'Sai Praneeth' });
  if (existing) {
    console.log('Assistant already exists:', existing._id);
    await mongoose.disconnect();
    return;
  }
  const a = new Assistant({
    name: 'Sai Praneeth',
    phone: '9999999999',
    age: 30,
    station: 'Warangal',
    stationCode: 'WL',
    languages: ['Telugu', 'Hindi', 'English'],
    permanentAddress: 'Warangal, Telangana',
    yearsOfExperience: 5,
    hasApplied: true,
    applicationStatus: 'Approved',
    editableApplication: false,
    verified: true,
    documentsVerified: true,
    isEligibleForBookings: true,
    revoked: false,
    availabilityStatus: 'active',
    isAvailable: true
  });
  await a.save();
  console.log('Assistant created:', a._id);
  await mongoose.disconnect();
}

main().catch(console.error);
