const bookingService = require('../services/bookingService');
exports.getBookings = async (req, res, next) => {
  try {
    const filter = req.query || {};
    const bookings = await bookingService.getAllBookings(filter);
    res.json({ success: true, bookings });
  } catch (err) { next(err); }
};
exports.updateStatus = async (req, res, next) => {
  try {
    const { bookingId, status } = req.body;
    const updated = await bookingService.changeBookingStatus(bookingId, status);
    res.json({ success: true, booking: updated });
  } catch (err) { next(err); }
};
