const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { adminOnly } = require('../middleware/authMiddleware');
router.get('/', adminOnly, bookingController.getBookings);
router.post('/status', adminOnly, bookingController.updateStatus);
module.exports = router;
