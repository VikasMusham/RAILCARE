// Debug script: Print all assistants and their station_code, name, status, verified
const mongoose = require('mongoose');
const Assistant = require('../src/models/Assistant');

async function main() {
  await mongoose.connect('mongodb://localhost:27017/YOUR_DB_NAME'); // <-- set your DB name
  const assistants = await Assistant.find({});
  for (const a of assistants) {
    console.log(`assistant_id=${a._id} name=${a.name} station_code=${a.station_code} status=${a.availabilityStatus} verified=${a.verified}`);
  }
  await mongoose.disconnect();
}

main().catch(console.error);
