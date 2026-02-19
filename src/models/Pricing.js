const mongoose = require('mongoose');
const PricingSchema = new mongoose.Schema({
  baseEscortPrice: Number,
  perBagPrice: Number,
  fullAssistPrice: Number,
  peakMultiplier: Number,
  nightMultiplier: Number,
  updatedAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Pricing', PricingSchema);
