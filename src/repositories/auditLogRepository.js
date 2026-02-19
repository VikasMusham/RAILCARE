const AuditLog = require('../models/AuditLog');
const logAction = async (data) => AuditLog.create(data);
const findLogs = async (filter) => AuditLog.find(filter).sort({ timestamp: -1 });
module.exports = { logAction, findLogs };
