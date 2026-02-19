// Script to normalize and verify all assistants for Warangal (WL)
// Script to normalize and verify all assistants for Warangal (WL) (legacy and new fields)
const mongoose = require('mongoose');
const Assistant = require('../backend/models/Assistant');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/railmitra';

async function main() {
  await mongoose.connect(MONGO_URI);
  // Update legacy field station_code and new field stationCode
  const result = await Assistant.updateMany(
    {
      $or: [
        { station_code: { $regex: /^\s*WL\s*$/i } },
        { station_code: { $regex: /^\s*WARANGAL\s*$/i } },
        { stationCode: { $regex: /^\s*WL\s*$/i } },
        { stationCode: { $regex: /^\s*WARANGAL\s*$/i } },
        { station: { $regex: /^\s*WARANGAL\s*$/i } }
      ]
    },
    {
      $set: {
        stationCode: 'WL',
        station_code: 'WL',
        station: 'Warangal',
        verified: true,
        applicationStatus: 'Approved',
        isEligibleForBookings: true,
        availabilityStatus: 'active',
        isAvailable: true,
        revoked: false
      }
    }
  );
  console.log('Updated assistants:', result.modifiedCount);
  await mongoose.disconnect();
}

main().catch(console.error);
