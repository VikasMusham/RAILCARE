const mongoose = require('mongoose');
const AuditLogSchema = new mongoose.Schema({
  action: String,
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  actorRole: String,
  targetType: String,
  targetId: String,
  changes: Object,
  timestamp: { type: Date, default: Date.now }
});
module.exports = mongoose.model('AuditLog', AuditLogSchema);
