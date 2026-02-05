const express = require('express');
const router = express.Router();
const Train = require('../models/Train');
const TrainStop = require('../models/TrainStop');
const { getServiceTypeAvailability } = require('../services/schedulingService');

/**
 * GET /api/trains
 * Search trains by name, number, or station
 * Query params:
 *   - search: string (min 2 chars)
 *   - limit: number (default 10)
 */
router.get('/', async (req, res) => {
  try {
    const { search, limit = 10 } = req.query;
    
    // Return empty if search is too short
    if (!search || search.length < 2) {
      return res.json({ success: true, trains: [] });
    }
    
    // Limit search string length to prevent ReDoS
    const sanitizedSearch = search.slice(0, 50).trim();
    
    // Cap limit to prevent abuse
    const safeLimit = Math.min(Math.max(parseInt(limit) || 10, 1), 20);
    
    // Escape special regex characters for safety
    const escapedSearch = sanitizedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Check if search is a number (train number search)
    const isNumber = /^\d+$/.test(search.trim());
    
    let trains = [];
    
    if (isNumber) {
      // For number search, use prefix match on indexed field
      trains = await Train.find({
        isActive: true,
        trainNumber: { $regex: `^${escapedSearch}` }
      })
        .select('trainNumber trainName sourceStation destinationStation type totalStops')
        .hint({ trainNumber: 1 })
        .limit(safeLimit)
        .lean();
    } else {
      // For text search, search in name and stations
      // First try to find exact word matches
      const wordRegex = new RegExp(`\\b${escapedSearch}`, 'i');
      
      trains = await Train.find({
        isActive: true,
        $or: [
          { trainName: { $regex: wordRegex } },
          { sourceStation: { $regex: wordRegex } },
          { destinationStation: { $regex: wordRegex } }
        ]
      })
        .select('trainNumber trainName sourceStation destinationStation type totalStops')
        .limit(safeLimit)
        .lean();
      
      // If no results, try partial match anywhere
      if (trains.length === 0) {
        trains = await Train.find({
          isActive: true,
          $or: [
            { trainName: { $regex: escapedSearch, $options: 'i' } },
            { sourceStation: { $regex: escapedSearch, $options: 'i' } },
            { destinationStation: { $regex: escapedSearch, $options: 'i' } }
          ]
        })
          .select('trainNumber trainName sourceStation destinationStation type totalStops')
          .limit(safeLimit)
          .lean();
      }
      
      // Also search by station code in stops
      if (trains.length === 0) {
        const stopsWithCode = await TrainStop.find({
          stationCode: { $regex: `^${escapedSearch}`, $options: 'i' }
        })
          .select('trainId')
          .limit(50)
          .lean();
        
        const trainIds = [...new Set(stopsWithCode.map(s => s.trainId.toString()))];
        
        if (trainIds.length > 0) {
          trains = await Train.find({
            _id: { $in: trainIds },
            isActive: true
          })
            .select('trainNumber trainName sourceStation destinationStation type totalStops')
            .limit(safeLimit)
            .lean();
        }
      }
    }
    
    // Sort results: prioritize shorter train numbers and exact matches
    trains.sort((a, b) => {
      // Exact train number match first
      if (a.trainNumber === search) return -1;
      if (b.trainNumber === search) return 1;
      // Then by train number length (shorter = more specific)
      return a.trainNumber.length - b.trainNumber.length;
    });
    
    return res.json({ success: true, trains });
  } catch (err) {
    console.error('[trains:search] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', trains: [] });
  }
});

/**
 * GET /api/trains/number/:trainNumber
 * Get train by train number
 */
router.get('/number/:trainNumber', async (req, res) => {
  try {
    const train = await Train.findOne({ trainNumber: req.params.trainNumber }).lean();
    if (!train) {
      return res.status(404).json({ success: false, message: 'Train not found' });
    }
    return res.json({ success: true, train });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/trains/:trainNumber/stops
 * Get all stops for a train
 */
router.get('/:trainNumber/stops', async (req, res) => {
  try {
    const { trainNumber } = req.params;
    
    // Find the train first
    const train = await Train.findOne({ trainNumber }).lean();
    if (!train) {
      return res.status(404).json({ success: false, message: 'Train not found' });
    }
    
    // Get all stops for this train, sorted by sequence
    const stops = await TrainStop.find({ trainId: train._id })
      .sort({ routeNumber: 1, stopSequence: 1 })
      .lean();
    
    return res.json({ 
      success: true, 
      train,
      stops,
      totalStops: stops.length
    });
  } catch (err) {
    console.error('[trains:stops] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/trains/:trainNumber/stations
 * Get stations for a train (optimized for dropdown)
 * Returns only required fields, ordered by stop_sequence
 * Performance: Uses indexed query on trainNumber with hint
 */
router.get('/:trainNumber/stations', async (req, res) => {
  try {
    const { trainNumber } = req.params;
    
    // Input validation - train numbers are 1-5 digits
    if (!trainNumber || !/^\d{1,5}$/.test(trainNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid train number format'
      });
    }
    
    // Use indexed query with hint to force index usage
    // Projection excludes _id to reduce payload size
    const stations = await TrainStop.find(
      { trainNumber },
      { 
        stationCode: 1, 
        stationName: 1, 
        arrivalTime: 1, 
        departureTime: 1,
        stopSequence: 1,
        _id: 0 
      }
    )
      .hint({ trainNumber: 1, stopSequence: 1 })
      .sort({ stopSequence: 1 })
      .lean();
    
    // If no stations found, check if train exists
    if (stations.length === 0) {
      const trainExists = await Train.exists({ trainNumber });
      if (!trainExists) {
        return res.status(404).json({ 
          success: false, 
          message: 'Train not found' 
        });
      }
      // Train exists but has no stops
      return res.json({ 
        success: true, 
        trainNumber,
        stations: [] 
      });
    }
    
    // Set cache headers for 5 minutes (stations don't change frequently)
    res.set('Cache-Control', 'public, max-age=300');
    
    return res.json({ 
      success: true, 
      trainNumber,
      stations,
      totalStations: stations.length
    });
  } catch (err) {
    console.error('[trains:stations] Error:', err.message);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

/**
 * GET /api/trains/station/:stationCode
 * Get all trains passing through a station
 */
router.get('/station/:stationCode', async (req, res) => {
  try {
    const { stationCode } = req.params;
    const { limit = 20 } = req.query;
    
    // Find stops at this station
    const stops = await TrainStop.find({ 
      stationCode: stationCode.toUpperCase() 
    })
      .select('trainId trainNumber arrivalTime departureTime')
      .limit(parseInt(limit))
      .lean();
    
    if (stops.length === 0) {
      return res.json({ success: true, trains: [], stationCode });
    }
    
    // Get unique train IDs
    const trainIds = [...new Set(stops.map(s => s.trainId.toString()))];
    
    // Fetch train details
    const trains = await Train.find({ _id: { $in: trainIds } })
      .select('trainNumber trainName sourceStation destinationStation type')
      .lean();
    
    // Combine with stop timing info
    const result = trains.map(train => {
      const stopInfo = stops.find(s => s.trainId.toString() === train._id.toString());
      return {
        ...train,
        arrivalTime: stopInfo?.arrivalTime,
        departureTime: stopInfo?.departureTime
      };
    });
    
    return res.json({ 
      success: true, 
      stationCode: stationCode.toUpperCase(),
      trains: result,
      totalTrains: result.length
    });
  } catch (err) {
    console.error('[trains:station] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/trains/:trainNumber/station/:stationCode/service-types
 * Get available service types for a station on a specific train
 * Returns which services (pickup/drop/round_trip) are allowed based on stop position
 */
router.get('/:trainNumber/station/:stationCode/service-types', async (req, res) => {
  try {
    const { trainNumber, stationCode } = req.params;
    
    // Input validation
    if (!trainNumber || !/^\d{1,5}$/.test(trainNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid train number format'
      });
    }
    
    if (!stationCode || stationCode.length > 10) {
      return res.status(400).json({
        success: false,
        message: 'Invalid station code'
      });
    }
    
    const availability = await getServiceTypeAvailability(
      trainNumber, 
      stationCode.toUpperCase()
    );
    
    if (!availability.available) {
      return res.status(404).json({
        success: false,
        message: availability.error || 'Station not found on this train'
      });
    }
    
    // Cache for 5 minutes
    res.set('Cache-Control', 'public, max-age=300');
    
    return res.json({
      success: true,
      trainNumber,
      ...availability
    });
  } catch (err) {
    console.error('[trains:service-types] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/trains/:id
 * Get train by MongoDB ObjectId (catch-all route - must be last)
 */
router.get('/:id', async (req, res) => {
  try {
    // Only try to find by ObjectId if it looks like a valid MongoDB ObjectId
    const id = req.params.id;
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(404).json({ success: false, message: 'Train not found' });
    }
    
    const train = await Train.findById(id).lean();
    if (!train) {
      return res.status(404).json({ success: false, message: 'Train not found' });
    }
    return res.json({ success: true, train });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
