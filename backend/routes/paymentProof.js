const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Booking = require('../models/Booking');

// Set up Multer for UPI proof uploads
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

// POST /api/payment/upload-proof
router.post('/upload-proof', upload.single('proof'), async (req, res) => {
  try {
    const { bookingId, upiRef } = req.body;
    if (!bookingId || !upiRef) {
      return res.status(400).json({ error: 'Missing bookingId or upiRef' });
    }
    const booking = await Booking.findOne({ _id: bookingId });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    booking.paymentStatus = 'Pending';
    booking.paymentMethod = 'UPI';
    booking.transactionId = upiRef;
    if (req.file) {
      booking.upiProofFile = `/uploads/upi_proofs/${req.file.filename}`;
    }
    await booking.save();
    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload UPI proof' });
  }
});

module.exports = router;
