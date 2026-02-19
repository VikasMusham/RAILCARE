/**
 * Scheduling Routes
 * 
 * API endpoints for service task management, monitoring, and scheduling operations.
 * Used by admin dashboard and assistant portal.
 * 
 * DISTRIBUTED ASSISTANT WORKFLOW:
 * - Round-trip bookings create TWO separate service tasks
 * - Each task can have a DIFFERENT assistant (multi-city support)
 * - Task-level assignment prevents cross-station errors
 */

const express = require('express');
const router = express.Router();
const ServiceTask = require('../models/ServiceTask');
const schedulingService = require('../services/schedulingService');
const taskQueueProcessor = require('../services/taskQueueProcessor');
const trainDelayTracker = require('../services/trainDelayTracker');
const taskAssignmentService = require('../services/taskAssignmentService');

/**
 * GET /api/scheduling/stats
 * Get overall scheduling system statistics
 */
router.get('/stats', async (req, res) => {
  try {
    // Get queue stats from processor
    const queueStats = taskQueueProcessor.getQueueStats();
    
    // Get delay tracking stats
    const delayStats = {
      trackedTrains: trainDelayTracker.getTrackedTrainsCount ? 
        trainDelayTracker.getTrackedTrainsCount() : 'N/A',
      isRunning: trainDelayTracker.isRunning || false
    };
    
    // Get task counts by status
    const taskCounts = await ServiceTask.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const statusCounts = {};
    taskCounts.forEach(tc => {
      statusCounts[tc._id] = tc.count;
    });
    
    // Get tasks by type
    const taskTypeCounts = await ServiceTask.aggregate([
      {
        $group: {
          _id: '$taskType',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const typeCounts = {};
    taskTypeCounts.forEach(tc => {
      typeCounts[tc._id] = tc.count;
    });
    
    res.json({
      success: true,
      stats: {
        queue: queueStats,
        delays: delayStats,
        tasks: {
          byStatus: statusCounts,
          byType: typeCounts,
          total: Object.values(statusCounts).reduce((a, b) => a + b, 0)
        }
      }
    });
    
  } catch (err) {
    console.error('[Scheduling Stats Error]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/scheduling/tasks/upcoming
 * Get upcoming tasks for a station
 */
router.get('/tasks/upcoming', async (req, res) => {
  try {
    const { station, hours = 4, limit = 20 } = req.query;
    if (!station) {
      return res.status(400).json({ 
        success: false, 
        message: 'station is required' 
      });
    }
    const tasks = await schedulingService.getUpcomingTasks(
      station, 
      parseInt(hours), 
      parseInt(limit)
    );
    res.json({
      success: true,
      station,
      hoursAhead: parseInt(hours),
      tasks
    });
  } catch (err) {
    console.error('[Upcoming Tasks Error]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/scheduling/tasks/overdue
 * Get overdue (past due) tasks
 */
router.get('/tasks/overdue', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const overdueTasks = await ServiceTask.find({
      status: { $in: ['pending', 'assigned'] },
      scheduledTime: { $lt: new Date() }
    })
    .sort({ scheduledTime: 1 })
    .limit(parseInt(limit))
    .populate('bookingId', 'passengerName passengerPhone');
    
    res.json({
      success: true,
      count: overdueTasks.length,
      tasks: overdueTasks
    });
    
  } catch (err) {
    console.error('[Overdue Tasks Error]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/scheduling/tasks/:taskId
 * Get a specific task by ID
 */
router.get('/tasks/:taskId', async (req, res) => {
  try {
    const task = await ServiceTask.findById(req.params.taskId)
      .populate('bookingId')
      .populate('assignedAssistant', 'name phone');
    
    if (!task) {
      return res.status(404).json({ 
        success: false, 
        message: 'Task not found' 
      });
    }
    
    res.json({ success: true, task });
    
  } catch (err) {
    console.error('[Get Task Error]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PATCH /api/scheduling/tasks/:taskId/assign
 * Assign a task to an assistant (TASK-LEVEL, not booking-level)
 * 
 * DISTRIBUTED WORKFLOW:
 * - Validates assistant is at correct station
 * - Prevents same assistant on both round-trip tasks
 * - Checks for concurrent task conflicts
 */
router.patch('/tasks/:taskId/assign', async (req, res) => {
  try {
    const { assistantId } = req.body;
    
    if (!assistantId) {
      return res.status(400).json({ 
        success: false, 
        message: 'assistantId is required' 
      });
    }
    
    // Use the task assignment service for validation and assignment
    const result = await taskAssignmentService.assignAssistantToTask(
      req.params.taskId,
      assistantId,
      { notes: 'Assigned via admin portal' }
    );
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.errors.join('; '),
        errors: result.errors,
        warnings: result.warnings || []
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Task assigned successfully',
      task: result.task,
      warnings: result.warnings || []
    });
    
  } catch (err) {
    console.error('[Assign Task Error]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PATCH /api/scheduling/tasks/:taskId/unassign
 * Unassign an assistant from a task
 */
router.patch('/tasks/:taskId/unassign', async (req, res) => {
  try {
    const { reason } = req.body;
    
    const result = await taskAssignmentService.unassignAssistantFromTask(
      req.params.taskId,
      reason || 'Unassigned via admin portal'
    );
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.errors.join('; ')
      });
    }
    
    res.json({
      success: true,
      message: 'Assistant unassigned from task',
      task: result.task
    });
    
  } catch (err) {
    console.error('[Unassign Task Error]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/scheduling/tasks/:taskId/available-assistants
 * Get available assistants for a specific task
 * Filters by station and workload
 */
router.get('/tasks/:taskId/available-assistants', async (req, res) => {
  try {
    const result = await taskAssignmentService.getAvailableAssistantsForTask(req.params.taskId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (err) {
    console.error('[Available Assistants Error]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/scheduling/tasks/:taskId/validate-assignment
 * Validate an assignment before committing
 * Returns validation result without making changes
 */
router.post('/tasks/:taskId/validate-assignment', async (req, res) => {
  try {
    const { assistantId } = req.body;
    
    if (!assistantId) {
      return res.status(400).json({
        success: false,
        message: 'assistantId is required'
      });
    }
    
    const validation = await taskAssignmentService.validateTaskAssignment(
      req.params.taskId,
      assistantId
    );
    
    res.json({
      success: true,
      taskId: req.params.taskId,
      assistantId,
      validation
    });
    
  } catch (err) {
    console.error('[Validate Assignment Error]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PATCH /api/scheduling/tasks/:taskId/status
 * Update task status
 */
router.patch('/tasks/:taskId/status', async (req, res) => {
  try {
    const { status, notes } = req.body;
    const validStatuses = ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'];
    
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }
    
    const task = await ServiceTask.findById(req.params.taskId);
    
    if (!task) {
      return res.status(404).json({ 
        success: false, 
        message: 'Task not found' 
      });
    }
    
    task.status = status;
    if (notes) task.notes = notes;
    if (status === 'completed') task.completedAt = new Date();
    
    await task.save();
    
    res.json({ 
      success: true, 
      message: `Task status updated to ${status}`,
      task 
    });
    
  } catch (err) {
    console.error('[Update Task Status Error]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/scheduling/booking/:bookingId/tasks
 * Get all tasks for a booking with detailed assignment status
 * Shows each task's assistant assignment independently
 */
router.get('/booking/:bookingId/tasks', async (req, res) => {
  try {
    const result = await taskAssignmentService.getBookingTaskAssignments(req.params.bookingId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (err) {
    console.error('[Booking Tasks Error]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/scheduling/assistant/:assistantId/tasks
 * Get tasks assigned to a specific assistant
 * CRITICAL: Assistants only see their own tasks
 * Pickup assistant does NOT see drop tasks
 */
router.get('/assistant/:assistantId/tasks', async (req, res) => {
  try {
    const { status, hoursAhead } = req.query;
    
    const options = {
      includeBookingDetails: true
    };
    
    if (status) {
      options.status = status.split(',');
    }
    if (hoursAhead) {
      options.hoursAhead = parseInt(hoursAhead);
    }
    
    const result = await taskAssignmentService.getAssistantTasks(
      req.params.assistantId,
      options
    );
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (err) {
    console.error('[Assistant Tasks Error]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/scheduling/booking/:bookingId/tasks
 * Cancel all tasks for a booking
 */
router.delete('/booking/:bookingId/tasks', async (req, res) => {
  try {
    const result = await schedulingService.cancelBookingTasks(req.params.bookingId);
    
    res.json({
      success: true,
      message: `${result.modifiedCount} tasks cancelled`,
      ...result
    });
    
  } catch (err) {
    console.error('[Cancel Tasks Error]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/scheduling/station/:stationCode/workload
 * Get workload analysis for a station
 */
router.get('/station/:station/workload', async (req, res) => {
  try {
    const { station } = req.params;
    const { hours = 24 } = req.query;
    const now = new Date();
    const futureLimit = new Date(now.getTime() + parseInt(hours) * 60 * 60 * 1000);
    // Case-insensitive station name match
    const matchStation = { $regex: new RegExp('^' + station.trim() + '$', 'i') };
    // Get task distribution by hour
    const tasksByHour = await ServiceTask.aggregate([
      {
        $match: {
          station: matchStation,
          scheduledTime: { $gte: now, $lte: futureLimit },
          status: { $in: ['pending', 'assigned'] }
        }
      },
      {
        $group: {
          _id: { $hour: '$scheduledTime' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ]);
    // Get total pending tasks
    const pendingCount = await ServiceTask.countDocuments({
      station: matchStation,
      status: 'pending',
      scheduledTime: { $gte: now, $lte: futureLimit }
    });
    // Get assigned tasks
    const assignedCount = await ServiceTask.countDocuments({
      station: matchStation,
      status: 'assigned',
      scheduledTime: { $gte: now, $lte: futureLimit }
    });
    res.json({
      success: true,
      station,
      hoursAhead: parseInt(hours),
      workload: {
        pending: pendingCount,
        assigned: assignedCount,
        total: pendingCount + assignedCount,
        byHour: tasksByHour
      }
    });
  } catch (err) {
    console.error('[Station Workload Error]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
