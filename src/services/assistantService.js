const assistantRepo = require('../repositories/assistantRepository');
const getAllAssistants = async (filter, options) => assistantRepo.findAssistants(filter, options);
const approveAssistant = async (id) => assistantRepo.updateAssistant(id, { verified: true, availabilityStatus: 'active' });
const rejectAssistant = async (id) => assistantRepo.updateAssistant(id, { verified: false, availabilityStatus: 'suspended' });
const deleteAssistant = async (id) => assistantRepo.deleteAssistant(id);
module.exports = { getAllAssistants, approveAssistant, rejectAssistant, deleteAssistant };
