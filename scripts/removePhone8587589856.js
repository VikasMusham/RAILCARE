// Script to remove any assistant or user with phone 8587589856
const mongoose = require('mongoose');
const Assistant = require('../backend/models/Assistant');
const User = require('../backend/models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/railmitra';

async function main() {
  await mongoose.connect(MONGO_URI);
  const assistantResult = await Assistant.deleteMany({ phone: '8587589856' });
  const userResult = await User.deleteMany({ phone: '8587589856' });
  console.log('Removed assistants:', assistantResult.deletedCount);
  console.log('Removed users:', userResult.deletedCount);
  await mongoose.disconnect();
}

main().catch(console.error);