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

      // Check if assistant is already assigned to the booking
      if (booking.assistantId) {
        // Assign this task to the same assistant
        task.status = 'assigned';
        task.notes = `${task.notes}\nAssigned to booking's assistant`.trim();
        await task.save();
        
        this.emit('taskAssigned', { task, assistantId: booking.assistantId });
        return;
      }

      // Check if within auto-assign window
      const minutesUntilTask = (task.scheduledTime - new Date()) / (1000 * 60);
      if (minutesUntilTask <= schedulingConfig.assignment.autoAssignWithinMinutes) {
        await this.attemptAutoAssign(task, booking);
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
      // Find available assistants at this station
      const availableAssistants = await Assistant.find({
        station: booking.station,
        applicationStatus: 'Approved',
        isEligibleForBookings: true,
        isOnline: true,
        currentBookingId: null
      }).lean();

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

      // Check assistant workload
      const eligibleAssistants = [];
      for (const assistant of availableAssistants) {
        const assignedTasks = await ServiceTask.countDocuments({
          status: { $in: ['assigned', 'in_progress'] },
          // Tasks assigned to this assistant's booking
          bookingId: { $in: await this.getAssistantBookingIds(assistant._id) }
        });

        if (assignedTasks < schedulingConfig.assignment.maxTasksPerAssistant) {
          eligibleAssistants.push({
            ...assistant,
            currentLoad: assignedTasks
          });
        }
      }

      if (eligibleAssistants.length === 0) {
        this.emit('capacityWarning', {
          task,
          station: booking.station,
          message: 'All assistants at capacity'
        });
        return;
      }

      // Sort by load (least loaded first)
      eligibleAssistants.sort((a, b) => a.currentLoad - b.currentLoad);

      // Select best assistant
      const selectedAssistant = eligibleAssistants[0];

      // Emit for manual confirmation (don't auto-assign in production without confirmation)
      this.emit('assignmentSuggestion', {
        task,
        booking,
        suggestedAssistant: selectedAssistant,
        alternativeAssistants: eligibleAssistants.slice(1, 4)
      });

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
