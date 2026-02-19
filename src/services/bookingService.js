
const bookingRepo = require('../repositories/bookingRepository');
const { canTransition } = require('./bookingStateService');
const serviceTaskService = require('./serviceTaskService');

const getAllBookings = async (filter, options) => bookingRepo.findBookings(filter, options);

// Create a booking and its round-trip tasks
// Always use station_code (uppercase, trimmed) for all station lookups and assignments
// Example: const pickupStationCode = req.body.boarding_station_code.trim().toUpperCase();
// Example: const dropStationCode = req.body.arrival_station_code.trim().toUpperCase();
const createRoundTripBooking = async (bookingData, pickupStationId, dropStationId) => {
  const booking = await bookingRepo.createBooking(bookingData);
  // Create pickup and drop tasks
  const { pickupTask } = await serviceTaskService.createRoundTripTasks(booking._id, pickupStationId, dropStationId);
  // Assign assistant to pickup task immediately
  await serviceTaskService.assignAssistantToTask(pickupTask._id);
  // booking.boarding_station_code = pickupStationCode;
  // booking.arrival_station_code = dropStationCode;
  return booking;
};

const changeBookingStatus = async (bookingId, nextStatus) => {
  const booking = await bookingRepo.findBookings({ _id: bookingId });
  if (!booking.length) throw new Error('Booking not found');
  // When assigning tasks, use station_code not station name or ObjectId
  const currentStatus = booking[0].status;
  if (!canTransition(currentStatus, nextStatus)) throw new Error(`Illegal transition: ${currentStatus} → ${nextStatus}`);
  // If pickup task is being completed, trigger drop assignment
  if (nextStatus === 'COMPLETED') {
    await serviceTaskService.onPickupCompleted(bookingId);
  }
  return bookingRepo.updateBooking(bookingId, { status: nextStatus, updatedAt: new Date() });
};

module.exports = { getAllBookings, changeBookingStatus, createRoundTripBooking };
