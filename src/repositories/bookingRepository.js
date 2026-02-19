const Booking = require('../models/Booking');
const findBookings = async (filter, options = {}) => Booking.find(filter).sort(options.sort || { createdAt: -1 }).populate('assistantId');
const createBooking = async (data) => Booking.create(data);
const updateBooking = async (id, update) => Booking.findByIdAndUpdate(id, update, { new: true });
const aggregateBookings = async (pipeline) => Booking.aggregate(pipeline);
module.exports = { findBookings, createBooking, updateBooking, aggregateBookings };
