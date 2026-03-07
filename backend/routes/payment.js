const express = require('express');
const router = express.Router();

const paymentController = require('../controllers/paymentController');
const multer = require('multer');
const path = require('path');
const Booking = require('../models/Booking');

router.post('/create-order', paymentController.createOrder);
router.post('/verify-and-book', paymentController.verifyAndBook);
router.post('/cash-on-delivery', paymentController.markCashOnDelivery);
router.post('/upi-paid', paymentController.markUPIPaid);
// COD paid confirmation by assistant
router.post('/cod-paid', paymentController.markCODPaid);

// UPI proof upload route (merged from paymentProof.js)
const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, path.join(__dirname, '../uploads/upi_proofs'));
	},
	filename: function (req, file, cb) {
		const ext = path.extname(file.originalname);
		cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`);
	}
});
const upload = multer({ storage });

router.post('/upload-proof', upload.single('proof'), async (req, res) => {
	try {
		const { bookingId, upiRef } = req.body;
		// Require bookingId; at least one of upiRef or proof file must be provided
		if (!bookingId) {
			return res.status(400).json({ success: false, error: 'Missing bookingId' });
		}
		if (!upiRef && !req.file) {
			return res.status(400).json({ success: false, error: 'Please provide UPI Transaction ID or upload payment screenshot' });
		}
		const booking = await Booking.findOne({ _id: bookingId });
		if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
		
		// Update booking with payment proof
		booking.paymentStatus = 'pending_verification'; // Admin needs to verify
		booking.paymentMethod = 'upi_qr';
		if (upiRef) {
			booking.transactionId = upiRef;
		}
		if (req.file) {
			booking.upiProofFile = `/uploads/upi_proofs/${req.file.filename}`;
		}
		booking.paymentSubmittedAt = new Date();
		await booking.save();
		
		console.log(`[Payment] UPI proof uploaded for booking ${bookingId}, txnId: ${upiRef || 'N/A'}, file: ${req.file ? req.file.filename : 'N/A'}`);
		res.json({ success: true, message: 'Payment proof submitted for verification', booking });
	} catch (err) {
		console.error('[Payment] Upload proof error:', err);
		res.status(500).json({ success: false, error: 'Failed to upload UPI proof' });
	}
});

module.exports = router;
