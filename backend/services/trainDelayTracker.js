/**
 * Train Delay Tracking Service
 * 
 * Monitors live train running status and updates task schedules.
 * Critical for operational reliability in Indian Railways context.
 * 
 * Architecture Pattern: Event-driven with polling fallback
 * 
 * Real-world considerations:
 * - Indian trains average 15-30 min delays
 * - Major routes can have 2-4 hour delays
 * - Festival seasons see significant disruptions
 */

const EventEmitter = require('events');
const ServiceTask = require('../models/ServiceTask');
const Booking = require('../models/Booking');
const schedulingConfig = require('../config/scheduling.config');

class TrainDelayTracker extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.pollInterval = null;
    this.trainCache = new Map(); // trainNumber -> { lastStatus, updatedAt }
    this.CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
  }

  /**
   * Start the delay tracking service
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('[TrainDelayTracker] Starting service...');
    
    // Initial check
    this.checkAllActiveTrains();
    
    // Set up polling interval
    this.pollInterval = setInterval(
      () => this.checkAllActiveTrains(),
      schedulingConfig.trainDelay.pollIntervalMs
    );
  }

  /**
   * Stop the delay tracking service
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    console.log('[TrainDelayTracker] Service stopped');
  }

  /**
   * Check all trains with active tasks
   */
  async checkAllActiveTrains() {
    try {
      // Get unique train numbers from pending/assigned tasks
      const activeTrains = await ServiceTask.distinct('trainNumber', {
        status: { $in: ['pending', 'assigned'] },
        scheduledTime: { 
          $gte: new Date(),
          $lte: new Date(Date.now() + schedulingConfig.assignment.lookAheadHours * 60 * 60 * 1000)
        }
      });

      console.log(`[TrainDelayTracker] Checking ${activeTrains.length} active trains`);

      for (const trainNumber of activeTrains) {
        await this.checkTrainStatus(trainNumber);
      }
    } catch (err) {
      console.error('[TrainDelayTracker] Error checking trains:', err.message);
    }
  }

  /**
   * Check status for a specific train
   * @param {string} trainNumber 
   */
  async checkTrainStatus(trainNumber) {
    try {
      // Check cache first
      const cached = this.trainCache.get(trainNumber);
      if (cached && Date.now() - cached.updatedAt < this.CACHE_TTL_MS) {
        return cached.status;
      }

      // Fetch live status (mock implementation - replace with real API)
      const liveStatus = await this.fetchLiveTrainStatus(trainNumber);
      
      // Update cache
      this.trainCache.set(trainNumber, {
        status: liveStatus,
        updatedAt: Date.now()
      });

      // Process delay if significant
      if (liveStatus.delayMinutes >= schedulingConfig.trainDelay.rescheduleThresholdMinutes) {
        await this.handleTrainDelay(trainNumber, liveStatus);
      }

      return liveStatus;
    } catch (err) {
      console.error(`[TrainDelayTracker] Error checking train ${trainNumber}:`, err.message);
      return null;
    }
  }

  /**
   * Fetch live train status from external API
   * TODO: Integrate with NTES/RailYatri API
   * @param {string} trainNumber 
   */
  async fetchLiveTrainStatus(trainNumber) {
    // MOCK IMPLEMENTATION
    // In production, integrate with:
    // 1. NTES (National Train Enquiry System) - enquiry.indianrail.gov.in
    // 2. RailYatri API
    // 3. ConfirmTkt API
    
    // For now, return scheduled time (no delay)
    return {
      trainNumber,
      isRunning: true,
      delayMinutes: 0,
      lastStation: null,
      nextStation: null,
      expectedArrival: null,
      source: 'mock',
      fetchedAt: new Date()
    };
    
    /* REAL IMPLEMENTATION EXAMPLE:
    const response = await fetch(`https://api.railyatri.in/train/${trainNumber}/live`);
    const data = await response.json();
    return {
      trainNumber,
      isRunning: data.is_running,
      delayMinutes: data.delay || 0,
      lastStation: data.last_station_code,
      nextStation: data.next_station_code,
      expectedArrival: data.stations.map(s => ({
        stationCode: s.code,
        expectedTime: s.expected_arrival
      })),
      source: 'railyatri',
      fetchedAt: new Date()
    };
    */
  }

  /**
   * Handle train delay - reschedule affected tasks
   * @param {string} trainNumber 
   * @param {Object} liveStatus 
   */
  async handleTrainDelay(trainNumber, liveStatus) {
    const { delayMinutes } = liveStatus;
    
    console.log(`[TrainDelayTracker] Train ${trainNumber} delayed by ${delayMinutes} minutes`);

    // Find affected tasks
    const affectedTasks = await ServiceTask.find({
      trainNumber,
      status: { $in: ['pending', 'assigned'] }
    });

    for (const task of affectedTasks) {
      try {
        // Calculate new times
        const oldScheduledTime = task.scheduledTime;
        const newScheduledTime = new Date(oldScheduledTime.getTime() + delayMinutes * 60 * 1000);
        const newAssistantArrival = new Date(task.assistantArrivalTime.getTime() + delayMinutes * 60 * 1000);

        // Update task
        task.scheduledTime = newScheduledTime;
        task.assistantArrivalTime = newAssistantArrival;
        task.notes = `${task.notes}\n[${new Date().toISOString()}] Rescheduled due to ${delayMinutes}min delay`.trim();
        await task.save();

        // Emit event for notifications
        this.emit('taskRescheduled', {
          task,
          trainNumber,
          delayMinutes,
          oldTime: oldScheduledTime,
          newTime: newScheduledTime
        });

        console.log(`[TrainDelayTracker] Task ${task._id} rescheduled: ${oldScheduledTime} -> ${newScheduledTime}`);
      } catch (err) {
        console.error(`[TrainDelayTracker] Failed to reschedule task ${task._id}:`, err.message);
      }
    }

    // Check for auto-cancel threshold
    if (delayMinutes >= schedulingConfig.trainDelay.autoCancelDelayMinutes) {
      await this.handleExcessiveDelay(trainNumber, affectedTasks);
    }
  }

  /**
   * Handle excessive delay - notify and potentially cancel
   * @param {string} trainNumber 
   * @param {Array} affectedTasks 
   */
  async handleExcessiveDelay(trainNumber, affectedTasks) {
    console.warn(`[TrainDelayTracker] Train ${trainNumber} excessively delayed - initiating escalation`);

    for (const task of affectedTasks) {
      this.emit('excessiveDelay', {
        task,
        trainNumber,
        message: 'Train is delayed beyond service threshold. Manual intervention required.'
      });
    }
  }

  /**
   * Get current delay for a train (from cache or fresh fetch)
   * @param {string} trainNumber 
   */
  async getTrainDelay(trainNumber) {
    const status = await this.checkTrainStatus(trainNumber);
    return status?.delayMinutes || 0;
  }

  /**
   * Clean up old cache entries
   */
  cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.trainCache.entries()) {
      if (now - value.updatedAt > this.CACHE_TTL_MS * 5) {
        this.trainCache.delete(key);
      }
    }
  }
}

// Singleton instance
const trainDelayTracker = new TrainDelayTracker();

module.exports = trainDelayTracker;
