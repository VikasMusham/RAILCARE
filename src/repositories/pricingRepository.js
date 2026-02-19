const Pricing = require('../models/Pricing');
const getPricing = async () => Pricing.findOne().sort({ updatedAt: -1 });
const updatePricing = async (update) => Pricing.findOneAndUpdate({}, update, { new: true });
module.exports = { getPricing, updatePricing };
