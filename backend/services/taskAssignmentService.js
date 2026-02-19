/**
 * Task Assignment Service
 * 
 * Handles task-level assistant assignment for distributed workflows.
 * Critical for round-trip bookings where different assistants handle different tasks.
 * 
 * Architecture:
 * - Booking = Customer Intent (parent entity)
 * - ServiceTask = Operational Execution (child tasks)
 * - Assistant = Workforce Layer (assigned per-task)
 * 
 * NEVER merge these responsibilities.
 */

const ServiceTask = require('../models/ServiceTask');
const Booking = require('../models/Booking');
const Assistant = require('../models/Assistant');

/**
 * Validation result object
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string[]} errors - Array of error messages
 * @property {string[]} warnings - Array of warning messages
 */

/**
 * Validate assistant assignment to a task
 * Prevents:
 * - Same assistant auto-assigned to both round-trip tasks
 * - Assigning assistant outside service station
 * - Double booking an assistant (concurrent overlapping tasks)
 * 
 * @param {string} taskId - The task to assign
 * @param {string} assistantId - The assistant to assign
 * @param {Object} options - Optional configuration
 * @returns {Promise<ValidationResult>}
 */
async function validateTaskAssignment(taskId, assistantId, options = {}) {
  const errors = [];
  const warnings = [];
  const { 
    allowCrossStation = false,
    allowSameAssistantForRoundTrip = false,
    checkConcurrentTasks = true
  } = options;

  try {
    // 1. Validate task exists and is assignable
    const task = await ServiceTask.findById(taskId).populate('bookingId');
    if (!task) {
      console.warn(`[ValidateAssign] Task not found: ${taskId}`);
      return { valid: false, errors: ['Task not found'], warnings: [] };
    }

    if (task.status === 'completed' || task.status === 'cancelled') {
      console.warn(`[ValidateAssign] Task ${taskId} is ${task.status}`);
      return { valid: false, errors: [`Cannot assign a ${task.status} task`], warnings: [] };
    }

    // 2. Validate assistant exists and is active
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) {
      console.warn(`[ValidateAssign] Assistant not found: ${assistantId}`);
      return { valid: false, errors: ['Assistant not found'], warnings: [] };
    }

    if (assistant.applicationStatus !== 'Approved') {
      console.warn(`[ValidateAssign] Assistant ${assistantId} not approved: status=${assistant.applicationStatus}`);
      return { valid: false, errors: ['Assistant is not approved for bookings'], warnings: [] };
    }

    if (!assistant.isEligibleForBookings) {
      console.warn(`[ValidateAssign] Assistant ${assistantId} not eligible for bookings`);
      return { valid: false, errors: ['Assistant is not eligible for bookings'], warnings: [] };
    }

    // 3. Validate station match (CRITICAL for multi-city operations)
    if (!allowCrossStation) {
      // Get station from task
      const taskStation = task.station;
      const assistantStation = assistant.station;

      // Compare station names (normalize both)
      const normalizedTaskStation = taskStation?.toUpperCase()?.trim();
      const normalizedAssistantStation = assistantStation?.toUpperCase()?.trim();

      if (normalizedTaskStation && normalizedAssistantStation && 
          normalizedTaskStation !== normalizedAssistantStation) {
        console.warn(`[ValidateAssign] Station mismatch: assistant=${normalizedAssistantStation}, task=${normalizedTaskStation}`);
        errors.push(
          `Assistant station (${normalizedAssistantStation}) does not match task station (${normalizedTaskStation}). ` +
          `Cross-station assignment not allowed.`
        );
      }
    }

    // 4. For round-trip: Check if same assistant is being assigned to both tasks
    if (!allowSameAssistantForRoundTrip && task.bookingId) {
      const booking = task.bookingId;
      
      if (booking.serviceType === 'round_trip') {
        // Get all tasks for this booking
        const siblingTasks = await ServiceTask.find({ 
          bookingId: booking._id,
          _id: { $ne: task._id }
        });

        for (const siblingTask of siblingTasks) {
          if (siblingTask.assignedAssistant?.toString() === assistantId.toString()) {
            errors.push(
              `Cannot assign same assistant to both pickup and drop tasks. ` +
              `Stations may be in different cities. Task ${siblingTask.taskType} already assigned to this assistant.`
            );
          }
        }

        // Enforce sequential assignment: drop (arrival) task cannot be assigned until pickup (boarding) is completed
        if (task.taskType === 'drop') {
          const pickupTask = siblingTasks.find(t => t.taskType === 'pickup');
          if (pickupTask && pickupTask.status !== 'completed') {
            errors.push('Arrival (drop) task cannot be assigned until boarding (pickup) task is completed.');
          }
        }
      }
    }

    // 5. Check for concurrent/overlapping tasks
    if (checkConcurrentTasks && task.scheduledTime) {
      // Define overlap window (30 minutes before and after)
      const overlapWindowMs = 30 * 60 * 1000;
      const taskTime = new Date(task.scheduledTime);
      const windowStart = new Date(taskTime.getTime() - overlapWindowMs);
      const windowEnd = new Date(taskTime.getTime() + overlapWindowMs);

      const concurrentTasks = await ServiceTask.find({
        _id: { $ne: task._id },
        assignedAssistant: assistantId,
        status: { $in: ['assigned', 'in_progress'] },
        scheduledTime: { $gte: windowStart, $lte: windowEnd }
      });

      if (concurrentTasks.length > 0) {
        const taskDetails = concurrentTasks.map(t => 
          `${t.taskType} at ${t.station} (${new Date(t.scheduledTime).toLocaleTimeString()})`
        ).join(', ');
        
        warnings.push(
          `Assistant has ${concurrentTasks.length} overlapping task(s): ${taskDetails}. ` +
          `Assignment will proceed but verify assistant availability.`
        );
      }
    }

    return { valid: errors.length === 0, errors, warnings };

  } catch (err) {
    return { 
      valid: false, 
      errors: [`Validation error: ${err.message}`], 
      warnings: [] 
    };
  }
}

/**
 * Assign an assistant to a specific task (not booking)
 * Supports distributed workflow for round-trip bookings
 * 
 * @param {string} taskId - The task to assign
 * @param {string} assistantId - The assistant to assign
 * @param {Object} options - Optional configuration
 * @returns {Promise<Object>} Assignment result
 */
async function assignAssistantToTask(taskId, assistantId, options = {}) {
  const { skipValidation = false, notes = '' } = options;

  // Validate first unless explicitly skipped
  if (!skipValidation) {
    const validation = await validateTaskAssignment(taskId, assistantId, options);
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors,
        warnings: validation.warnings
      };
    }
    
    // Log warnings but proceed
    if (validation.warnings.length > 0) {
      console.warn(`[TaskAssignment] Warnings for task ${taskId}:`, validation.warnings);
    }
  }

  try {
    const task = await ServiceTask.findById(taskId);
    if (!task) {
      return { success: false, errors: ['Task not found'] };
    }

    // Update task
    task.assignedAssistant = assistantId;
    task.assignedAt = new Date();
    task.status = 'assigned';
    if (notes) {
      task.notes = `${task.notes}\n${notes}`.trim();
    }
    await task.save();

    // Lock assistant for this booking
    const assistant = await Assistant.findById(assistantId);
    if (assistant) {
      assistant.isEligibleForBookings = false;
      assistant.currentBookingId = task.bookingId;
      await assistant.save();
    }

    // Update booking status if needed
    await updateBookingStatusFromTasks(task.bookingId);

    return {
      success: true,
      task,
      message: 'Assistant assigned to task successfully'
    };

  } catch (err) {
    return {
      success: false,
      errors: [`Assignment failed: ${err.message}`]
    };
  }
}

/**
 * Unassign an assistant from a task
 * @param {string} taskId - The task to unassign
 * @param {string} reason - Reason for unassignment
 * @returns {Promise<Object>}
 */
async function unassignAssistantFromTask(taskId, reason = '') {
  try {
    const task = await ServiceTask.findById(taskId);
    if (!task) {
      return { success: false, errors: ['Task not found'] };
    }

    if (!task.assignedAssistant) {
      return { success: false, errors: ['Task has no assigned assistant'] };
    }

    // Unlock assistant if assigned
    if (task.assignedAssistant) {
      const assistant = await Assistant.findById(task.assignedAssistant);
      if (assistant) {
        assistant.isEligibleForBookings = true;
        assistant.currentBookingId = null;
        await assistant.save();
      }
    }
    task.assignedAssistant = null;
    task.assignedAt = null;
    task.status = 'pending';
    if (reason) {
      task.notes = `${task.notes}\nUnassigned: ${reason}`.trim();
    }
    await task.save();

    // Update booking status
    await updateBookingStatusFromTasks(task.bookingId);

    return {
      success: true,
      task,
      message: 'Assistant unassigned from task'
    };

  } catch (err) {
    return {
      success: false,
      errors: [`Unassignment failed: ${err.message}`]
    };
  }
}

/**
 * Update booking status based on its tasks' statuses
 * For round-trip: Booking is "Assigned" only when ALL tasks are assigned
 * @param {string} bookingId 
 */
async function updateBookingStatusFromTasks(bookingId) {
  try {
    const booking = await Booking.findById(bookingId);
    if (!booking) return;

    const tasks = await ServiceTask.find({ bookingId });
    if (tasks.length === 0) return;

    // Determine aggregate status
    const allAssigned = tasks.every(t => t.status === 'assigned' || t.status === 'in_progress' || t.status === 'completed');
    const allCompleted = tasks.every(t => t.status === 'completed');
    const anyInProgress = tasks.some(t => t.status === 'in_progress');
    const anyCancelled = tasks.every(t => t.status === 'cancelled');
    const someAssigned = tasks.some(t => t.status === 'assigned');

    // Map task statuses to booking status
    if (allCompleted) {
      booking.status = 'Completed';
    } else if (anyCancelled) {
      booking.status = 'Cancelled';
    } else if (anyInProgress) {
      booking.status = 'In Progress';
    } else if (allAssigned) {
      booking.status = 'Accepted';
    } else if (someAssigned) {
      // Partially assigned - keep as Searching for remaining
      booking.status = 'Searching';
    } else {
      booking.status = 'Searching';
    }

    await booking.save();
  } catch (err) {
    console.error('[updateBookingStatusFromTasks] Error:', err.message);
  }
}

/**
 * Get detailed task assignment status for a booking
 * Shows each task with its assignment status
 * @param {string} bookingId 
 * @returns {Promise<Object>}
 */
async function getBookingTaskAssignments(bookingId) {
  try {
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return { success: false, errors: ['Booking not found'] };
    }

    const tasks = await ServiceTask.find({ bookingId })
      .sort({ taskSequence: 1 })
      .populate('assignedAssistant', 'name phone station rating');

    const taskSummary = tasks.map(task => ({
      taskId: task._id,
      taskType: task.taskType,
      taskSequence: task.taskSequence,
      station: task.station,
      scheduledTime: task.scheduledTime,
      status: task.status,
      assistant: task.assignedAssistant ? {
        id: task.assignedAssistant._id,
        name: task.assignedAssistant.name,
        phone: task.assignedAssistant.phone,
        station: task.assignedAssistant.station,
        rating: task.assignedAssistant.rating
      } : null,
      isAssigned: !!task.assignedAssistant,
      assignedAt: task.assignedAt
    }));

    const allAssigned = taskSummary.every(t => t.isAssigned);
    const noneAssigned = taskSummary.every(t => !t.isAssigned);

    return {
      success: true,
      bookingId,
      serviceType: booking.serviceType,
      bookingStatus: booking.status,
      taskCount: tasks.length,
      allTasksAssigned: allAssigned,
      noTasksAssigned: noneAssigned,
      tasks: taskSummary
    };

  } catch (err) {
    return {
      success: false,
      errors: [`Failed to get task assignments: ${err.message}`]
    };
  }
}

/**
 * Get tasks assigned to a specific assistant
 * Filters by station to ensure assistants only see their relevant tasks
 * @param {string} assistantId 
 * @param {Object} options - Filter options
 * @returns {Promise<Object>}
 */
async function getAssistantTasks(assistantId, options = {}) {
  const {
    station = null,
    status = ['pending', 'assigned', 'in_progress'],
    includeBookingDetails = true,
    hoursAhead = 24
  } = options;

  try {
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) {
      return { success: false, errors: ['Assistant not found'] };
    }

    // Build query
    const query = {
      assignedAssistant: assistantId,
      status: { $in: status }
    };

    // Filter by station if provided (use assistant's station if not specified)
    if (station) {
      query.station = station;
    }

    // Filter by time window
    if (hoursAhead) {
      const now = new Date();
      const futureLimit = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
      query.scheduledTime = { $gte: now, $lte: futureLimit };
    }

    let taskQuery = ServiceTask.find(query).sort({ scheduledTime: 1 });
    
    if (includeBookingDetails) {
      taskQuery = taskQuery.populate('bookingId');
    }

    const tasks = await taskQuery;

    return {
      success: true,
      assistantId,
      assistantStation: assistant.station,
      taskCount: tasks.length,
      tasks: tasks.map(task => ({
        taskId: task._id,
        taskType: task.taskType,
        station: task.station,
        trainNumber: task.trainNumber,
        scheduledTime: task.scheduledTime,
        assistantArrivalTime: task.assistantArrivalTime,
        status: task.status,
        assistantAction: task.assistantAction,
        booking: includeBookingDetails && task.bookingId ? {
          bookingId: task.bookingId._id,
          passengerName: task.bookingId.passengerName,
          passengerPhone: task.bookingId.passengerPhone,
          trainName: task.bookingId.trainName,
          coach: task.bookingId.coach,
          seat: task.bookingId.seat,
          services: task.bookingId.services,
          serviceType: task.bookingId.serviceType,
          luggageItems: task.bookingId.luggageItems,
          passengerNotes: task.bookingId.passengerNotes
        } : null
      }))
    };

  } catch (err) {
    return {
      success: false,
      errors: [`Failed to get assistant tasks: ${err.message}`]
    };
  }
}

/**
 * Get available assistants for a task
 * Filters by station and availability
 * @param {string} taskId 
 * @returns {Promise<Object>}
 */
async function getAvailableAssistantsForTask(taskId) {
  try {
    const task = await ServiceTask.findById(taskId).populate('bookingId');
    if (!task) {
      return { success: false, errors: ['Task not found'] };
    }

    // For round_trip, ensure pickup and drop use correct station
    let stationMatch = { $or: [] };
    if (task.bookingId && task.bookingId.serviceType === 'round_trip') {
      if (task.taskType === 'pickup') {
        stationMatch = { station: task.station };
      } else if (task.taskType === 'drop') {
        stationMatch = { station: task.station };
      }
    } else {
      // For single pickup/drop, match by station
      stationMatch = { station: task.station };
    }

    // Relaxed: ignore isOnline and currentBookingId for availability
    const assistants = await Assistant.find({
      ...stationMatch,
      applicationStatus: 'Approved',
      isEligibleForBookings: true
    }).select('name phone station rating ratingCount isOnline');

    // For each assistant, check current workload
    const assistantsWithWorkload = await Promise.all(
      assistants.map(async (assistant) => {
        const activeTaskCount = await ServiceTask.countDocuments({
          assignedAssistant: assistant._id,
          status: { $in: ['assigned', 'in_progress'] }
        });
        return {
          id: assistant._id,
          name: assistant.name,
          phone: assistant.phone,
          station: assistant.station,
          rating: assistant.rating || 0,
          ratingCount: assistant.ratingCount || 0,
          isOnline: assistant.isOnline || false,
          activeTaskCount,
          available: activeTaskCount < 5 // Max 5 concurrent tasks
        };
      })
    );

    // Sort: online first, then by rating, then by workload
    assistantsWithWorkload.sort((a, b) => {
      if (a.isOnline !== b.isOnline) return b.isOnline - a.isOnline;
      if (a.rating !== b.rating) return b.rating - a.rating;
      return a.activeTaskCount - b.activeTaskCount;
    });

    return {
      success: true,
      taskId,
      station: task.station,
      availableCount: assistantsWithWorkload.filter(a => a.available).length,
      assistants: assistantsWithWorkload
    };

  } catch (err) {
    return {
      success: false,
      errors: [`Failed to get available assistants: ${err.message}`]
    };
  }
}

module.exports = {
  // Core assignment functions
  validateTaskAssignment,
  assignAssistantToTask,
  unassignAssistantFromTask,
  
  // Query functions
  getBookingTaskAssignments,
  getAssistantTasks,
  getAvailableAssistantsForTask,
  
  // Utility
  updateBookingStatusFromTasks
};
