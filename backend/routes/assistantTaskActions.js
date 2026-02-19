// Accept/Decline endpoints for ServiceTask (boarding/pickup)
const express = require('express');
const router = express.Router();
const ServiceTask = require('../models/ServiceTask');
const Assistant = require('../models/Assistant');
const { authenticate, authorize } = require('../middleware/auth');
const { assignAssistantToTask, unassignAssistantFromTask } = require('../services/taskAssignmentService');

// Accept a pickup (boarding) task
router.post('/tasks/:taskId/accept', authenticate, authorize('assistant'), async (req, res) => {
  try {
    const assistantId = req.user.id;
    const { taskId } = req.params;
    const task = await ServiceTask.findById(taskId);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    if (task.taskType !== 'pickup') return res.status(400).json({ success: false, message: 'Only pickup tasks can be accepted here' });
    if (task.status !== 'assigned' || String(task.assignedAssistant) !== String(assistantId)) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this task or task is not in assigned state' });
    }
    task.status = 'in_progress';
    await task.save();
    res.json({ success: true, message: 'Task accepted and marked in progress', task });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Decline a pickup (boarding) task
router.post('/tasks/:taskId/decline', authenticate, authorize('assistant'), async (req, res) => {
  try {
    const assistantId = req.user.id;
    const { taskId } = req.params;
    const task = await ServiceTask.findById(taskId);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    if (task.taskType !== 'pickup') return res.status(400).json({ success: false, message: 'Only pickup tasks can be declined here' });
    if (task.status !== 'assigned' || String(task.assignedAssistant) !== String(assistantId)) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this task or task is not in assigned state' });
    }
    // Unassign assistant and set status back to pending
    await unassignAssistantFromTask(taskId, 'Assistant declined the task');
    res.json({ success: true, message: 'Task declined and unassigned' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
