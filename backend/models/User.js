const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, enum: ['passenger','assistant','admin'], required: true },
  phone: { type: String },
  password: { type: String },
  resetToken: { type: String },
  resetExpires: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
