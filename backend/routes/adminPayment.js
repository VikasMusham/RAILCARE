const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

router.get('/bookings-with-payment', adminController.listBookingsWithPayment);

module.exports = router;
