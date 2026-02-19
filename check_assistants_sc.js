// check_assistants_sc.js
// Usage: node check_assistants_sc.js
// Make sure to run from the railmitra directory and update the DB connection string if needed.

const mongoose = require('./backend/node_modules/mongoose');
const Assistant = require('./backend/models/Assistant');

const MONGO_URI = 'mongodb://localhost:27017/YOUR_DB_NAME'; // <-- CHANGE THIS TO YOUR DB NAME

async function main() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const assistants = await Assistant.find({
    station: 'SC',
    isOnline: true,
    isEligibleForBookings: true,
    applicationStatus: 'Approved',
    currentBookingId: null
  });
  console.log('Eligible assistants at SC:', assistants.map(a => a.name));
  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
