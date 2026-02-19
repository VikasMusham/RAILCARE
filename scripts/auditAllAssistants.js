// Script to print all assistants and their key fields for audit
const mongoose = require('mongoose');
const Assistant = require('../src/models/Assistant');

async function main() {
  await mongoose.connect('mongodb://localhost:27017/YOUR_DB_NAME'); // <-- set your DB name
  const assistants = await Assistant.find({});
  for (const a of assistants) {
    console.log(`assistant_id=${a._id} name=${a.name} station_code='${a.station_code}' verified=${a.verified} availabilityStatus=${a.availabilityStatus} isAvailable=${a.isAvailable}`);
  }
  await mongoose.disconnect();
}

main().catch(console.error);
