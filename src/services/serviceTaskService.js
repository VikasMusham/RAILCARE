const ServiceTask = require('../models/ServiceTask');
const Assistant = require('../models/Assistant');

// Create pickup and drop tasks for a round-trip booking
const createRoundTripTasks = async (bookingId, pickupStationId, dropStationId) => {
  // pickupStationId and dropStationId are now station names
  const pickupName = pickupStationId.trim();
  const dropName = dropStationId.trim();
  // Create pickup task (assign immediately)
  const pickupTask = await ServiceTask.create({
    bookingId,
    taskType: 'pickup',
    station: pickupName,
    status: 'PENDING'
  });
  // Create drop task (do not assign yet)
  const dropTask = await ServiceTask.create({
    bookingId,
    taskType: 'drop',
    station: dropName,
    status: 'PENDING'
  });
  return { pickupTask, dropTask };
};

// Assign the first available assistant at a station to a task
const assignAssistantToTask = async (taskId) => {
  const task = await ServiceTask.findById(taskId);
  if (!task) throw new Error('Task not found');
  if (task.status !== 'PENDING') return task;
  // Normalize station name for case-insensitive match
  const stationName = task.station.trim().toLowerCase();
  // Debug: log assistant search
  console.log(`[AutoAssign] Looking for assistant at station='${stationName}' for task ${taskId}`);
  const assistant = await Assistant.findOne({
    station: { $regex: new RegExp('^' + stationName + '$', 'i') },
    verified: true
  });
  if (assistant) {
    console.log(`[AutoAssign] Found eligible assistant ${assistant._id} for task ${taskId} at station='${stationName}'`);
    task.assignedAssistant = assistant._id;
    task.status = 'ASSIGNED';
    await task.save();
    console.log(`[AutoAssign] Task ${taskId} assigned to assistant ${assistant._id}`);
  } else {
    console.warn(`[AutoAssign] No eligible assistant found at station='${stationName}' for task ${taskId}. Task remains PENDING.`);
    // Do NOT cancel the task, leave as PENDING for later/manual assignment
    // Optionally, log or notify admin here
  }
  return task;
};

// When a pickup task is completed, assign the drop task
const onPickupCompleted = async (bookingId) => {
  const dropTask = await ServiceTask.findOne({ bookingId, taskType: 'drop' });
  if (dropTask) {
    console.log(`[onPickupCompleted] Found drop task ${dropTask._id} for booking ${bookingId}, status=${dropTask.status}`);
    if (dropTask.status === 'PENDING') {
      await assignAssistantToTask(dropTask._id);
    } else {
      console.log(`[onPickupCompleted] Drop task ${dropTask._id} is not PENDING (status=${dropTask.status}), skipping assignment.`);
    }
  } else {
    console.warn(`[onPickupCompleted] No drop task found for booking ${bookingId}`);
  }
};

module.exports = {
  createRoundTripTasks,
  assignAssistantToTask,
  onPickupCompleted,
  // Manual assignment for admin UI/API
  assignSpecificAssistantToTask: async (taskId, assistantId) => {
    const task = await ServiceTask.findById(taskId);
    if (!task) throw new Error('Task not found');
    if (task.status !== 'PENDING') return task;
    const assistant = await Assistant.findById(assistantId);
    if (!assistant) throw new Error('Assistant not found');
    // Normalize codes
    const code = task.station_code.trim().toUpperCase();
    const acode = assistant.station_code.trim().toUpperCase();
    if (
      acode !== code ||
      !assistant.verified
    ) {
      throw new Error('Assistant is not eligible for this task/station');
    }
    task.assignedAssistant = assistant._id;
    task.status = 'ASSIGNED';
    await task.save();
    return task;
  }
};
