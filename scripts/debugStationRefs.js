// Script to print all assistants and service tasks with their station references
const mongoose = require('mongoose');
const Assistant = require('../src/models/Assistant');
const ServiceTask = require('../src/models/ServiceTask');
const Station = require('../src/models/Station');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost/railmitra';

async function main() {
  await mongoose.connect(MONGO_URI);
  const stations = await Station.find();
  const stationMap = {};
  stations.forEach(s => stationMap[s._id.toString()] = s.name || s.code || s._id.toString());

  const assistants = await Assistant.find();
  console.log('Assistants:');
  assistants.forEach(a => {
    console.log(`- ${a.name} | currentStation: ${a.currentStation} (${stationMap[a.currentStation?.toString()] || 'Unknown'})`);
  });

  const tasks = await ServiceTask.find();
  console.log('\nServiceTasks:');
  tasks.forEach(t => {
    console.log(`- ${t.taskType} | stationId: ${t.stationId} (${stationMap[t.stationId?.toString()] || 'Unknown'}) | status: ${t.status}`);
  });

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
