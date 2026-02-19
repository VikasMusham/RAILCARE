/**
 * Smart Assistant Matching Service
 * Production-grade algorithm for matching passengers with the best assistant
 * Similar to Uber/Ola driver matching
 */

const Assistant = require('../models/Assistant');
const Booking = require('../models/Booking');

/**
 * Calculate match score for an assistant against a booking
 * Higher score = better match
 */
function calculateMatchScore(assistant, booking) {
  let score = 0;
  
  // Base score for being available
  score += 100;
  
  // Language match (high priority) - up to 50 points
  const bookingLanguages = booking.preferredLanguages || (booking.language ? [booking.language] : []);
  const assistantLanguages = assistant.languages || [];
  
  if (bookingLanguages.length > 0) {
    const matchingLanguages = bookingLanguages.filter(lang => 
      assistantLanguages.some(aLang => 
        aLang.toLowerCase() === lang.toLowerCase()
      )
    );
    score += matchingLanguages.length * 25; // 25 points per matching language
  }
  
  // Experience bonus - up to 30 points
  const experience = assistant.yearsOfExperience || 0;
  score += Math.min(experience * 3, 30);
  
  // Rating bonus - up to 50 points
  const rating = assistant.rating || 0;
  score += rating * 10; // 5-star = 50 points
  
  // Completed bookings bonus (reliability) - up to 20 points
  const completedBookings = assistant.totalBookingsCompleted || 0;
  score += Math.min(completedBookings * 2, 20);
  
  // Online recency bonus - up to 10 points
  if (assistant.lastOnlineAt) {
    const minutesAgo = (Date.now() - new Date(assistant.lastOnlineAt).getTime()) / (1000 * 60);
    if (minutesAgo < 5) score += 10;
    else if (minutesAgo < 15) score += 7;
    else if (minutesAgo < 30) score += 5;
    else if (minutesAgo < 60) score += 2;
  }
  
  return score;
}

/**
 * Find the best matching assistant for a booking
 * @param {Object} booking - The booking document
 * @returns {Object} { assistant, score } or null if no match
 */
/**
 * Find the best matching assistant for a booking or a specific station
 * @param {Object} booking - The booking document
 * @param {String} [stationOverride] - Optional station code to use instead of booking.station
 * @returns {Object} { assistant, score } or null if no match
 */
async function findBestAssistant(booking, stationOverride) {
  try {
    // Special handling for Warangal (stationCode 'WL')
    if ((booking.stationCode === 'WL' || booking.station === 'Warangal')) {
      // Find any eligible, approved, unassigned Warangal assistant
      const warangalAssistant = await Assistant.findOne({
        $or: [
          { station: 'Warangal' },
          { stationCode: 'WL' }
        ],
        applicationStatus: 'Approved',
        isEligibleForBookings: true,
        currentBookingId: null
      }).lean();
      if (warangalAssistant) {
        console.log(`[Matching] Warangal: assigning eligible assistant ${warangalAssistant.name} (${warangalAssistant._id})`);
        return { assistant: warangalAssistant, score: 100 };
      }
    }

    // Step 1: Find all eligible assistants for this station
    let eligibleAssistants = await Assistant.find({
      $or: [
        { station: stationOverride || booking.station },
        { stationCode: stationOverride || booking.stationCode }
      ],
      applicationStatus: 'Approved',
      isEligibleForBookings: true,
      isOnline: true,
      currentBookingId: null // Not currently busy
    }).lean();

    // Strict language filter: assistant must know ALL required languages
    const bookingLanguages = booking.preferredLanguages || (booking.language ? [booking.language] : []);
    if (bookingLanguages.length > 0) {
      const requiredLangs = bookingLanguages.map(l => l.trim().toLowerCase());
      eligibleAssistants = eligibleAssistants.filter(a =>
        Array.isArray(a.languages) && requiredLangs.every(reqLang =>
          a.languages.some(lang => lang && lang.trim().toLowerCase() === reqLang)
        )
      );
      // If no eligible assistants after strict language filter, return null (no match)
      if (eligibleAssistants.length === 0) {
        console.log(`[Matching] No assistants found with all required languages: [${requiredLangs.join(', ')}]`);
        return null;
      }
    }

    console.log(`[Matching] Found ${eligibleAssistants.length} eligible assistants for station: ${stationOverride || booking.station}`);

    if (eligibleAssistants.length === 0) {
      // Fallback: Try offline but approved assistants
      let offlineAssistants = await Assistant.find({
        $or: [
          { station: booking.station },
          { stationCode: booking.stationCode }
        ],
        applicationStatus: 'Approved',
        isEligibleForBookings: true,
        currentBookingId: null
      }).lean();

      // Strict language filter for offline as well
      if (bookingLanguages.length > 0) {
        const requiredLangs = bookingLanguages.map(l => l.trim().toLowerCase());
        offlineAssistants = offlineAssistants.filter(a =>
          Array.isArray(a.languages) && requiredLangs.every(reqLang =>
            a.languages.some(lang => lang && lang.trim().toLowerCase() === reqLang)
          )
        );
        // If no offline assistants match, return null (no match)
        if (offlineAssistants.length === 0) {
          console.log(`[Matching] No offline assistants found with all required languages: [${requiredLangs.join(', ')}]`);
          return null;
        }
      }

      if (offlineAssistants.length > 0) {
        console.log(`[Matching] Found ${offlineAssistants.length} offline assistants as fallback`);
        // Score and sort offline assistants
        const scored = offlineAssistants.map(a => ({
          assistant: a,
          score: calculateMatchScore(a, booking) - 50 // Penalty for being offline
        }));
        scored.sort((a, b) => b.score - a.score);
        return scored[0];
      }

      return null;
    }

    // Step 2: Score all eligible assistants
    const scoredAssistants = eligibleAssistants.map(assistant => ({
      assistant,
      score: calculateMatchScore(assistant, booking)
    }));

    // Step 3: Sort by score (highest first)
    scoredAssistants.sort((a, b) => b.score - a.score);

    console.log(`[Matching] Top 3 scored assistants:`, 
      scoredAssistants.slice(0, 3).map(s => ({ name: s.assistant.name, score: s.score }))
    );

    // Return the best match
    return scoredAssistants[0];

  } catch (err) {
    console.error('[Matching] Error finding best assistant:', err);
    return null;
  }
}

/**
 * Main matching function - assigns an assistant to a booking
 * @param {string} bookingId - The booking ID to match
 * @returns {Object} { success, booking, assistant, message }
 */
async function matchAssistant(bookingId) {
  try {
    // Get the booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return { success: false, message: 'Booking not found' };
    }
    
    // Don't match if already assigned
    if (booking.assistantId && booking.status !== 'Pending' && booking.status !== 'Searching') {
      return { 
        success: true, 
        message: 'Booking already has an assistant',
        booking,
        assistant: await Assistant.findById(booking.assistantId)
      };
    }
    
    // Increment match attempts
    booking.matchAttempts = (booking.matchAttempts || 0) + 1;
    
    // Find the best assistant
    const match = await findBestAssistant(booking);
    
    if (!match) {
      // No assistant found
      booking.status = 'Searching';
      await booking.save();
      
      console.log(`[Matching] No assistant found for booking ${bookingId}, status set to Searching`);
      
      return { 
        success: false, 
        message: 'No available assistant found. Booking is in searching mode.',
        booking,
        assistant: null
      };
    }
    
    // Assign the assistant
    const { assistant, score } = match;
    
    // Update booking
    booking.assistantId = assistant._id;
    booking.status = 'Assigned';
    booking.assignedAt = new Date();
    booking.matchScore = score;
    await booking.save();
    
    // Update assistant - mark as busy
    await Assistant.findByIdAndUpdate(assistant._id, {
      currentBookingId: booking._id
    });
    
    console.log(`[Matching] Assigned assistant ${assistant.name} (score: ${score}) to booking ${bookingId}`);
    
    return {
      success: true,
      message: `Matched with ${assistant.name}`,
      booking,
      assistant,
      score
    };
    
  } catch (err) {
    console.error('[Matching] Error in matchAssistant:', err);
    return { success: false, message: 'Error during matching: ' + err.message };
  }
}

/**
 * Retry matching for all bookings in "Searching" status
 * Should be called periodically (e.g., every 30 seconds)
 */
async function retrySearchingBookings() {
  try {
    const searchingBookings = await Booking.find({ status: 'Searching' });
    
    console.log(`[Matching] Retrying ${searchingBookings.length} searching bookings`);
    
    for (const booking of searchingBookings) {
      await matchAssistant(booking._id);
    }
    
  } catch (err) {
    console.error('[Matching] Error in retry:', err);
  }
}

/**
 * Release assistant from booking (when booking completes or cancels)
 */
async function releaseAssistant(bookingId) {
  try {
    const booking = await Booking.findById(bookingId);
    if (!booking || !booking.assistantId) return;
    
    await Assistant.findByIdAndUpdate(booking.assistantId, {
      currentBookingId: null
    });
    
    console.log(`[Matching] Released assistant from booking ${bookingId}`);
    
  } catch (err) {
    console.error('[Matching] Error releasing assistant:', err);
  }
}

/**
 * Manually reassign a booking to a different assistant
 */
async function reassignBooking(bookingId, newAssistantId) {
  try {
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return { success: false, message: 'Booking not found' };
    }
    
    const newAssistant = await Assistant.findById(newAssistantId);
    if (!newAssistant) {
      return { success: false, message: 'Assistant not found' };
    }
    
    // Check if new assistant is eligible
    if (newAssistant.applicationStatus !== 'Approved' || !newAssistant.isEligibleForBookings) {
      return { success: false, message: 'Assistant is not eligible for bookings' };
    }
    
    // Release old assistant
    if (booking.assistantId) {
      await Assistant.findByIdAndUpdate(booking.assistantId, {
        currentBookingId: null
      });
    }
    
    // Assign new assistant
    booking.assistantId = newAssistant._id;
    booking.status = 'Assigned';
    booking.assignedAt = new Date();
    await booking.save();
    
    // Mark new assistant as busy
    await Assistant.findByIdAndUpdate(newAssistant._id, {
      currentBookingId: booking._id
    });
    
    return { success: true, booking, assistant: newAssistant };
    
  } catch (err) {
    console.error('[Matching] Reassign error:', err);
    return { success: false, message: err.message };
  }
}

module.exports = {
  matchAssistant,
  findBestAssistant,
  calculateMatchScore,
  retrySearchingBookings,
  releaseAssistant,
  reassignBooking
};
