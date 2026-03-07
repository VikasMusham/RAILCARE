console.log('[DEBUG] Starting server.js...');
const app = require('./src/app');
const mongoose = require('mongoose');
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost/railmitra';

console.log('[DEBUG] Connecting to MongoDB:', MONGO_URI);
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('[DEBUG] MongoDB connected');
    app.listen(PORT, () => {
      console.log(`[DEBUG] Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('[DEBUG] MongoDB connection error:', err);
  });
