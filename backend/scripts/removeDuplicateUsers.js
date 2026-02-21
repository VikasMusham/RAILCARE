// Script to remove duplicate users by phone (keeping the most recent)
const mongoose = require('mongoose');
const User = require('../models/User');

async function removeDuplicateUsers() {
  await mongoose.connect('mongodb://localhost:27017/railmitra', { useNewUrlParser: true, useUnifiedTopology: true });
  const users = await User.find({});
  const seen = new Map();
  const toDelete = [];
  // Keep the most recent user for each phone
  users.sort((a, b) => b.createdAt - a.createdAt).forEach(user => {
    if (user.phone && seen.has(user.phone)) {
      toDelete.push(user._id);
    } else if (user.phone) {
      seen.set(user.phone, user._id);
    }
  });
  if (toDelete.length > 0) {
    await User.deleteMany({ _id: { $in: toDelete } });
    console.log(`Removed ${toDelete.length} duplicate users.`);
  } else {
    console.log('No duplicate users found.');
  }
  await mongoose.disconnect();
}

removeDuplicateUsers().catch(console.error);