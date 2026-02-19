/**
 * Task Queue Processor
 * 
 * Background job processor for service tasks.
 * Implements patterns from enterprise logistics systems.
 * 
 * Features:
 * - Priority queue based on scheduled time
 * - Automatic assignment with retry
 * - Escalation for unassigned tasks
 * - SLA monitoring
 * 
 * Architecture: Bull-queue compatible interface (can swap to Redis-based Bull in production)
 */

const EventEmitter = require('events');
const ServiceTask = require('../models/ServiceTask');
const Assistant = require('../models/Assistant');
const Booking = require('../models/Booking');
const schedulingConfig = require('../config/scheduling.config');

class TaskQueueProcessor extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.processInterval = null;
    this.PROCESS_INTERVAL_MS = 30 * 1000; // 30 seconds
  }


  /**
   * Start the task queue processor
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('[TaskQueue] Starting processor...');
    
    // Process immediately
    this.processPendingTasks();
    
    // Set up interval
    this.processInterval = setInterval(
      () => this.processPendingTasks(),
      this.PROCESS_INTERVAL_MS
    );
  }

  /**
   * Stop the processor
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    console.log('[TaskQueue] Processor stopped');
  }

  /**
   * Process all pending tasks that need attention
   */
  async processPendingTasks() {
    try {
      const lookAheadTime = new Date(
        Date.now() + schedulingConfig.assignment.lookAheadHours * 60 * 60 * 1000
      );

      // Find tasks that need assignment
      const pendingTasks = await ServiceTask.find({
        status: 'pending',
        scheduledTime: { $lte: lookAheadTime }
      })
      .sort({ scheduledTime: 1 })
      .limit(50)
      .populate('bookingId');

      console.log(`[TaskQueue] Processing ${pendingTasks.length} pending tasks`);

      for (const task of pendingTasks) {
        await this.processTask(task);
      }

      // Check for overdue tasks
      await this.handleOverdueTasks();
      
      // Check for SLA violations
      await this.checkSLAViolations();

    } catch (err) {
      console.error('[TaskQueue] Error processing tasks:', err.message);
    }
  }

  /**
   * Process a single task
   * @param {Object} task 
   */
  async processTask(task) {
    try {
      // Skip if booking was cancelled
      const booking = await Booking.findById(task.bookingId);
      if (!booking || booking.status === 'Cancelled' || booking.status === 'Rejected') {
        task.status = 'cancelled';
        task.notes = `${task.notes}\nCancelled: Booking status is ${booking?.status || 'not found'}`.trim();
        await task.save();
        return;
      }

      // If assistant is already assigned to the booking, assign this task to them
      if (booking.assistantId) {
        task.status = 'assigned';
        task.notes = `${task.notes}\nAssigned to booking's assistant`.trim();
        await task.save();
        this.emit('taskAssigned', { task, assistantId: booking.assistantId });
        return;
      }

      // Always attempt auto-assignment for pickup (boarding) tasks before cancelling
      const minutesUntilTask = (task.scheduledTime - new Date()) / (1000 * 60);
      let attemptedAutoAssign = false;
      if (task.taskType === 'pickup' || (booking.serviceType === 'round_trip' && task.taskType === 'pickup')) {
        // Try auto-assign regardless of window for pickup
        await this.attemptAutoAssign(task, booking);
        attemptedAutoAssign = true;
      } else if (minutesUntilTask <= schedulingConfig.assignment.autoAssignWithinMinutes) {
        await this.attemptAutoAssign(task, booking);
        attemptedAutoAssign = true;
      }

      // After auto-assign attempt, reload task to check if assigned
      const updatedTask = await ServiceTask.findById(task._id);
      if (updatedTask.status === 'pending' && attemptedAutoAssign) {
        // No assistant available, escalate/capacity warning already handled in attemptAutoAssign
        // Only cancel if business logic requires, otherwise leave as pending for manual intervention
        // task.status = 'cancelled';
        // task.notes = `${task.notes}\nAuto-cancelled: No assistant available at boarding station`.trim();
        // await task.save();
      }
    } catch (err) {
      console.error(`[TaskQueue] Error processing task ${task._id}:`, err.message);
    }
  }

  /**
   * Attempt to auto-assign an assistant to a task
   * @param {Object} task 
   * @param {Object} booking 
   */
  async attemptAutoAssign(task, booking) {
    try {
      // Find available assistants at this station, fallback to booking.station if needed
      // Normalize station name for matching
      let stationToMatch = (task.station || booking.station || '').toUpperCase().trim();
      const availableAssistants = await Assistant.find({
        station: stationToMatch,
        applicationStatus: 'Approved',
        isEligibleForBookings: true,
        verified: true
      }).lean();
      console.log(`[AutoAssign] Found ${availableAssistants.length} available assistants at station ${task.station}`);
      if (availableAssistants.length > 0) {
        availableAssistants.forEach(a => console.log(`[AutoAssign] Assistant: ${a.name} (${a._id}) - Eligible: ${a.isEligibleForBookings}, Approved: ${a.applicationStatus}`));
      }

      if (availableAssistants.length === 0) {
        // No assistants available - escalate if urgent
        const minutesUntilTask = (task.scheduledTime - new Date()) / (1000 * 60);
        if (minutesUntilTask <= schedulingConfig.notifications.escalationMinutes) {
          this.emit('escalation', {
            task,
            booking,
            reason: 'No assistants available',
            urgency: 'high'
          });
        }
        return;
      }


      // For pickup (boarding) tasks, assign the best available assistant even if at capacity
      let selectedAssistant = null;
      if (task.taskType === 'pickup' || (booking.serviceType === 'round_trip' && task.taskType === 'pickup')) {
        // Sort by fewest assigned tasks, then by rating
        const assistantsWithLoad = await Promise.all(
          availableAssistants.map(async (assistant) => {
            const assignedTasks = await ServiceTask.countDocuments({
              assignedAssistant: assistant._id,
              status: { $in: ['assigned', 'in_progress'] }
            });
            return {
              ...assistant,
              currentLoad: assignedTasks
            };
          })
        );
        assistantsWithLoad.sort((a, b) => a.currentLoad - b.currentLoad || (b.rating || 0) - (a.rating || 0));
        selectedAssistant = assistantsWithLoad[0];
      } else {
        // For other tasks, respect maxTasksPerAssistant
        const eligibleAssistants = [];
        for (const assistant of availableAssistants) {
          const assignedTasks = await ServiceTask.countDocuments({
            assignedAssistant: assistant._id,
            status: { $in: ['assigned', 'in_progress'] }
          });
          if (assignedTasks < schedulingConfig.assignment.maxTasksPerAssistant) {
            eligibleAssistants.push({
              ...assistant,
              currentLoad: assignedTasks
            });
          }
        }
        eligibleAssistants.sort((a, b) => a.currentLoad - b.currentLoad);
        selectedAssistant = eligibleAssistants[0];
        if (!selectedAssistant) {
          this.emit('capacityWarning', {
            task,
            station: booking.station,
            message: 'All assistants at capacity'
          });
          return;
        }
      }

      // Assign the selected assistant to the task
      if (selectedAssistant) {
        const assignService = require('./taskAssignmentService');
        console.log(`[AutoAssign] Attempting to assign task ${task._id} at station ${task.station} to assistant ${selectedAssistant.name} (${selectedAssistant._id || selectedAssistant.id})`);
        const result = await assignService.assignAssistantToTask(task._id, selectedAssistant._id || selectedAssistant.id, { skipValidation: false });
        if (result.success) {
          console.log(`[AutoAssign] Assigned task ${task._id} at station ${task.station} to assistant ${selectedAssistant.name} (${selectedAssistant._id || selectedAssistant.id})`);
        } else {
          console.warn(`[AutoAssign] Failed to assign task ${task._id} at station ${task.station}:`, result.errors);
        }
        this.emit('assignmentSuggestion', {
          task,
          booking,
          suggestedAssistant: selectedAssistant,
          alternativeAssistants: []
        });
      } else {
        console.warn(`[AutoAssign] No eligible assistant selected for task ${task._id} at station ${task.station}`);
      }

    } catch (err) {
      console.error(`[TaskQueue] Auto-assign failed for task ${task._id}:`, err.message);
    }
  }

  /**
   * Get booking IDs assigned to an assistant
   * @param {string} assistantId 
   */
  async getAssistantBookingIds(assistantId) {
    const bookings = await Booking.find({
      assistantId,
      status: { $nin: ['Completed', 'Cancelled', 'Rejected'] }
    }).select('_id');
    return bookings.map(b => b._id);
  }

  /**
   * Handle tasks that are past their scheduled time but not started
   */
  async handleOverdueTasks() {
    const overdueThreshold = new Date(
      Date.now() - schedulingConfig.operational.taskExpiryMinutes * 60 * 1000
    );

    const overdueTasks = await ServiceTask.find({
      status: { $in: ['pending', 'assigned'] },
      scheduledTime: { $lt: overdueThreshold }
    });

    for (const task of overdueTasks) {
      console.warn(`[TaskQueue] Task ${task._id} is overdue`);
      
      this.emit('taskOverdue', {
        task,
        overdueMinutes: Math.round((Date.now() - task.scheduledTime) / (1000 * 60))
      });

      // Mark as expired if way past due
      if (Date.now() - task.scheduledTime > schedulingConfig.operational.taskExpiryMinutes * 2 * 60 * 1000) {
        task.status = 'cancelled';
        task.notes = `${task.notes}\nAuto-cancelled: Task expired without completion`.trim();
        await task.save();
      }
    }
  }

  /**
   * Check for SLA violations
   */
  async checkSLAViolations() {
    // Find tasks in progress for too long
    const maxDurationMs = schedulingConfig.sla.maxTaskDurationMinutes * 60 * 1000;
    const threshold = new Date(Date.now() - maxDurationMs);

    const longRunningTasks = await ServiceTask.find({
      status: 'in_progress',
      updatedAt: { $lt: threshold }
    });

    for (const task of longRunningTasks) {
      const durationMinutes = Math.round((Date.now() - task.updatedAt) / (1000 * 60));
      
      this.emit('slaViolation', {
        task,
        type: 'duration_exceeded',
        durationMinutes,
        threshold: schedulingConfig.sla.maxTaskDurationMinutes
      });
    }
  }

  /**
   * Get queue statistics
   */
  async getStats() {
    const now = new Date();
    const lookAhead = new Date(Date.now() + 4 * 60 * 60 * 1000);

    const [pending, assigned, inProgress, completed, overdue] = await Promise.all([
      ServiceTask.countDocuments({ status: 'pending', scheduledTime: { $lte: lookAhead } }),
      ServiceTask.countDocuments({ status: 'assigned' }),
      ServiceTask.countDocuments({ status: 'in_progress' }),
      ServiceTask.countDocuments({ status: 'completed', completedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
      ServiceTask.countDocuments({ status: { $in: ['pending', 'assigned'] }, scheduledTime: { $lt: now } })
    ]);

    return {
      pending,
      assigned,
      inProgress,
      completedLast24h: completed,
      overdue,
      queueHealth: overdue === 0 ? 'healthy' : overdue < 5 ? 'warning' : 'critical'
    };
  }
}

// Singleton instance
const taskQueueProcessor = new TaskQueueProcessor();

module.exports = taskQueueProcessor;
