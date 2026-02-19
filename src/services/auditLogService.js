const auditRepo = require('../repositories/auditLogRepository');
const logAction = async (data) => auditRepo.logAction(data);
const getLogs = async (filter) => auditRepo.findLogs(filter);
module.exports = { logAction, getLogs };
