// Script to print all assistants at WL (Warangal) with all fields
const mongoose = require('mongoose');
const Assistant = require('../backend/models/Assistant');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/railmitra';

(async () => {
  await mongoose.connect(MONGO_URI);
  const assistants = await Assistant.find({ stationCode: 'WL' });
  if (!assistants.length) {
    console.log('No assistants found for WL (Warangal).');
  } else {
    assistants.forEach(a => {
      console.log(JSON.stringify(a, null, 2));
    });
  }
  await mongoose.disconnect();
})();
