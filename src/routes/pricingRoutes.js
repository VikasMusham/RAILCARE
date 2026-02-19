const express = require('express');
const router = express.Router();
const pricingController = require('../controllers/pricingController');
const { adminOnly } = require('../middleware/authMiddleware');
router.get('/', adminOnly, pricingController.getPricing);
router.post('/update', adminOnly, pricingController.updatePricing);
module.exports = router;
