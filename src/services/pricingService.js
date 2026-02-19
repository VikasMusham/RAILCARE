const pricingRepo = require('../repositories/pricingRepository');
const getPricing = async () => pricingRepo.getPricing();
const updatePricing = async (update) => pricingRepo.updatePricing(update);
module.exports = { getPricing, updatePricing };
