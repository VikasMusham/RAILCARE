exports.deleteAssistant = async (req, res, next) => {
  try {
    const { id } = req.params;
    const removed = await assistantService.deleteAssistant(id);
    if (!removed) {
      return res.status(404).json({ success: false, message: 'Assistant not found' });
    }
    res.json({ success: true, message: 'Assistant removed successfully' });
  } catch (err) { next(err); }
};
const assistantService = require('../services/assistantService');
exports.getAssistants = async (req, res, next) => {
  try {
    const filter = req.query || {};
    const assistants = await assistantService.getAllAssistants(filter);
    res.json({ success: true, assistants });
  } catch (err) { next(err); }
};
exports.approve = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await assistantService.approveAssistant(id);
    res.json({ success: true, assistant: updated });
  } catch (err) { next(err); }
};
exports.reject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await assistantService.rejectAssistant(id);
    res.json({ success: true, assistant: updated });
  } catch (err) { next(err); }
};
