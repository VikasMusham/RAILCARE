const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/railmitra').then(async () => {
  const Assistant = require('../backend/models/Assistant');
  const assistants = await Assistant.find({ 
    $or: [
      { station: /warangal/i }, 
      { stationCode: /wl/i }
    ] 
  }).lean();
  
  console.log('\n=== Assistants for Warangal ===\n');
  if (assistants.length === 0) {
    console.log('No assistants found for Warangal station.');
  } else {
    assistants.forEach(a => {
      console.log('Name:', a.name);
      console.log('  Station:', a.station);
      console.log('  StationCode:', a.stationCode);
      console.log('  isEligibleForBookings:', a.isEligibleForBookings);
      console.log('  currentBookingId:', a.currentBookingId);
      console.log('  applicationStatus:', a.applicationStatus);
      console.log('  verified:', a.verified);
      console.log('  isOnline:', a.isOnline);
      console.log('---');
    });
  }
  
  mongoose.disconnect();
});
