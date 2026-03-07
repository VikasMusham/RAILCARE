// Assistant marks COD as paid
exports.markCODPaid = async (req, res) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) return res.status(400).json({ error: 'Missing bookingId' });
    // Try to find by _id first, then by bookingId field
    let booking = await Booking.findById(bookingId);
    if (!booking) {
      booking = await Booking.findOne({ bookingId: bookingId });
    }
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    // Check for COD payment method (handle different formats)
    const isCOD = ['COD', 'cod', 'Cash on Delivery', 'cash_on_delivery'].includes(booking.paymentMethod);
    if (!isCOD) {
      return res.status(400).json({ error: 'Not a COD booking' });
    }
    booking.paymentStatus = 'Paid';
    booking.cashCollected = true;
    await booking.save();
    console.log(`[Payment] COD marked as paid for booking ${bookingId}`);
    res.json({ success: true, booking });
  } catch (err) {
    console.error('[Payment] markCODPaid error:', err);
    res.status(500).json({ error: 'Failed to mark COD as paid' });
  }
};
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Booking = require('../models/Booking');

const razorpay = new Razorpay({
  key_id: 'rzp_test_SIkJ0K2Hzpfn0v',
  key_secret: '2559Gqcr9ieAJw7aNscfqAr3',
});

exports.createOrder = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount) return res.status(400).json({ error: 'Missing amount' });
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // Razorpay expects paise
      currency: 'INR',
      payment_capture: 1,
    });
    res.json({ order });
  } catch (err) {
    console.error('Razorpay createOrder error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
};
// Razorpay verify and booking creation
exports.verifyAndBook = async (req, res) => {
  try {
    const { payment_id, order_id, signature, bookingData } = req.body;
    if (!payment_id || !order_id || !signature || !bookingData) {
      return res.status(400).json({ error: 'Missing payment or booking data' });
    }
    // Verify signature
    const generated_signature = crypto.createHmac('sha256', razorpay.key_secret)
      .update(order_id + '|' + payment_id)
      .digest('hex');
    if (generated_signature !== signature) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
    // Create booking only after payment is confirmed
    const booking = new Booking({
      ...bookingData,
      paymentStatus: 'Paid',
      paymentMethod: 'Razorpay',
      transactionId: payment_id
    });
    await booking.save();
    res.json({ success: true, booking });
  } catch (err) {
    console.error('Razorpay verifyAndBook error:', err);
    res.status(500).json({ error: 'Payment verification or booking creation failed' });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !bookingId) {
      return res.status(400).json({ error: 'Missing payment details' });
    }
    const booking = await Booking.findOne({ bookingId });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const generated_signature = crypto.createHmac('sha256', razorpay.key_secret)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');
    if (generated_signature === razorpay_signature) {
      booking.paymentStatus = 'Paid';
      booking.transactionId = razorpay_payment_id;
      booking.paymentMethod = 'Razorpay';
      await booking.save();
      return res.json({ success: true });
    } else {
      booking.paymentStatus = 'Failed';
      await booking.save();
      return res.status(400).json({ error: 'Invalid signature' });
    }
  } catch (err) {
    console.error('Razorpay verifyPayment error:', err);
    res.status(500).json({ error: 'Payment verification failed' });
  }
};

// Add Cash on Delivery
exports.markCashOnDelivery = async (req, res) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) return res.status(400).json({ error: 'Missing bookingId' });
    const booking = await Booking.findOne({ bookingId });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    booking.paymentStatus = 'Pending';
    booking.paymentMethod = 'Cash on Delivery';
    await booking.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark as Cash on Delivery' });
  }
};

// Add UPI Intent (mark as paid after manual confirmation)
exports.markUPIPaid = async (req, res) => {
  try {
    const { bookingId, upiRef } = req.body;
    if (!bookingId || !upiRef) return res.status(400).json({ error: 'Missing bookingId or upiRef' });
    const booking = await Booking.findOne({ bookingId });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    booking.paymentStatus = 'Paid';
    booking.paymentMethod = 'UPI';
    booking.transactionId = upiRef;
    await booking.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark UPI payment' });
  }
};
