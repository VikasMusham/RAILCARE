const auditLogService = require('../services/auditLogService');
exports.getLogs = async (req, res, next) => {
  try {
    const logs = await auditLogService.getLogs(req.query);
    res.json({ success: true, logs });
  } catch (err) { next(err); }
};
