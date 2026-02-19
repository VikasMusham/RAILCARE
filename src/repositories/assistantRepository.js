const Assistant = require('../models/Assistant');
const findAssistants = async (filter, options = {}) => Assistant.find(filter).sort(options.sort || { name: 1 });
const updateAssistant = async (id, update) => Assistant.findByIdAndUpdate(id, update, { new: true });
const deleteAssistant = async (id) => Assistant.findByIdAndDelete(id);
module.exports = { findAssistants, updateAssistant, deleteAssistant };
