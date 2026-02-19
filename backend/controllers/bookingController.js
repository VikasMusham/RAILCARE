const Booking = require('../models/Booking');
const recommendationService = require('../services/recommendationService');
const railwayApiService = require('../services/railwayApiService');

exports.createBooking = async (req, res, next) => {
  try {
    const { passenger, train, services, station, pickupStation, dropStation, stationCode } = req.body;
    const bookingId = 'BK' + Math.floor(100000 + Math.random() * 900000);
    // Normalize station fields
    const normalizedStation = (station || '').toUpperCase().trim();
    const normalizedPickupStation = (pickupStation || station || '').toUpperCase().trim();
    const normalizedDropStation = (dropStation || station || '').toUpperCase().trim();
    const normalizedStationCode = (stationCode || '').toUpperCase().trim();

    // Fetch passenger profile to get phone
    const User = require('../models/User');
    let passengerPhone = '';
    if (passenger) {
      // Try to get by _id if present, else by name
      let passengerProfile = null;
      if (passenger._id) {
        passengerProfile = await User.findById(passenger._id);
      } else if (passenger.name) {
        passengerProfile = await User.findOne({ name: passenger.name });
      }
      if (passengerProfile && passengerProfile.phone) {
        passengerPhone = passengerProfile.phone;
      }
    }

    const booking = new Booking({
      passenger,
      train,
      services,
      bookingId,
      station: normalizedStation,
      pickupStation: normalizedPickupStation,
      dropStation: normalizedDropStation,
      stationCode: normalizedStationCode,
      passengerPhone,
    });
    await booking.save();
    res.json({ bookingId });
  } catch (err) {
    next(err);
  }
};

exports.getBookingById = async (req, res, next) => {
  try {
    const booking = await Booking.findOne({ bookingId: req.params.id });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const trainStatus = await railwayApiService.getTrainStatus(booking.train.number);
    const recommendation = recommendationService.getRecommendedArrival(booking.train.expectedArrival);
    res.json({ booking, trainStatus, recommendation });
  } catch (err) {
    next(err);
  }
};
