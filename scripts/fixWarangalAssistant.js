// Fix Warangal assistant eligibility and languages
// Run: node scripts/fixWarangalAssistant.js

const mongoose = require('mongoose');
const Assistant = require('../backend/models/Assistant');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/railmitra';

async function main() {
  await mongoose.connect(MONGO_URI);
  const query = {
    $or: [
      { station: 'Warangal' },
      { stationCode: 'WL' }
    ]
  };
  const update = {
    station: 'Warangal',
    stationCode: 'WL',
    applicationStatus: 'Approved',
    isEligibleForBookings: true,
    languages: ['hindi', 'telugu', 'english'],
    revoked: false
  };
  const result = await Assistant.findOneAndUpdate(query, update, { new: true });
  if (result) {
    console.log('✅ Warangal assistant updated:', result);
  } else {
    // If not found, create one
    const newAssistant = new Assistant({
      name: 'Warangal Assistant',
      station: 'Warangal',
      stationCode: 'WL',
      applicationStatus: 'Approved',
      isEligibleForBookings: true,
      languages: ['hindi', 'telugu', 'english'],
      verified: true,
      revoked: false
    });
    await newAssistant.save();
    console.log('✅ Warangal assistant created:', newAssistant);
  }
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
