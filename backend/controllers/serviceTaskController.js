// serviceTaskController.js
// Handles event-based activation and assignment for round-trip tasks

const ServiceTask = require('../models/ServiceTask');
const Assistant = require('../models/Assistant');
const taskAssignmentService = require('../services/taskAssignmentService');
const taskQueueProcessor = require('../services/taskQueueProcessor');

/**
 * Mark a service task as completed and trigger round-trip logic
 * If this is a pickup (boarding) task for a round-trip, activate the arrival (drop) task
 */
exports.completeTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await ServiceTask.findById(taskId).populate('bookingId');
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    // Mark as completed
    task.status = 'completed';
    task.completedAt = new Date();
    await task.save();

    // If this is a round-trip pickup, activate the drop task
    const booking = task.bookingId;
    if (booking && booking.serviceType === 'round_trip' && task.taskType === 'pickup') {
      // Find the drop (arrival) task
      const dropTask = await ServiceTask.findOne({
        bookingId: booking._id,
        taskType: 'drop',
        status: 'pending'
      });
      if (dropTask) {
        // Activate the drop task
        dropTask.status = 'assigned';
        await dropTask.save();
        // Trigger auto-assignment for the arrival station
        await taskQueueProcessor.processTask(dropTask);
      }
    }

    res.json({ success: true, message: 'Task completed', task });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
