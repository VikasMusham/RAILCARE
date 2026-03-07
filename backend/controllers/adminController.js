const Booking = require('../models/Booking');

// List all bookings with payment status
exports.listBookingsWithPayment = async (req, res) => {
  try {
    const bookings = await Booking.find({}, 'bookingId passengerName paymentStatus paymentMethod transactionId price createdAt').sort({ createdAt: -1 });
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};
