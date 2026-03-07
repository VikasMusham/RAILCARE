// Script to set all WARANGAL (WL) assistants as available and eligible for booking
const mongoose = require('mongoose');
const Assistant = require('../backend/models/Assistant');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/railmitra';

async function fixWarangalAssistants() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const result = await Assistant.updateMany(
    { $or: [ { station: 'WARANGAL' }, { stationCode: 'WL' } ] },
    {
      $set: {
        applicationStatus: 'Approved',
        isEligibleForBookings: true,
        isOnline: true,
        currentBookingId: null
      }
    }
  );
  console.log('Updated assistants:', result.modifiedCount);
  await mongoose.disconnect();
}

fixWarangalAssistants().catch(err => {
  console.error('Error updating assistants:', err);
  process.exit(1);
});
