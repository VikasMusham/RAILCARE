const pricingService = require('../services/pricingService');
exports.getPricing = async (req, res, next) => {
  try {
    const pricing = await pricingService.getPricing();
    res.json({ success: true, pricing });
  } catch (err) { next(err); }
};
exports.updatePricing = async (req, res, next) => {
  try {
    const update = req.body;
    const updated = await pricingService.updatePricing(update);
    res.json({ success: true, pricing: updated });
  } catch (err) { next(err); }
};
