// check_service_tasks.js
// Usage: node check_service_tasks.js <BOOKING_ID>
// Prints all service tasks for a booking and their assigned assistants.

const mongoose = require('./backend/node_modules/mongoose');
const ServiceTask = require('./backend/models/ServiceTask');
const Assistant = require('./backend/models/Assistant');

const MONGO_URI = 'mongodb://localhost:27017/YOUR_DB_NAME'; // <-- CHANGE THIS TO YOUR DB NAME

async function main() {
  const bookingId = process.argv[2];
  if (!bookingId) {
    console.error('Usage: node check_service_tasks.js <BOOKING_ID>');
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const tasks = await ServiceTask.find({ bookingId }).populate('assignedAssistant');
  if (!tasks.length) {
    console.log('No service tasks found for this booking.');
  } else {
    tasks.forEach(task => {
      console.log(`Task: ${task.taskType} at ${task.stationCode} | Assistant: ${task.assignedAssistant ? task.assignedAssistant.name : 'None'}`);
    });
  }
  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
