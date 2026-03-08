const mongoose = require('mongoose');

const SupportTicketSchema = new mongoose.Schema({
  ticketId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  passengerName: { type: String, required: true },
  passengerEmail: { type: String, default: '' },
  passengerPhone: { type: String, default: '' },
  issueCategory: { type: String, default: '' },
  issueTrail: { type: String, default: '' },
  chatHistory: [{ type: String }],
  status: { 
    type: String, 
    enum: ['open', 'in-progress', 'resolved', 'closed'], 
    default: 'open' 
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  adminNotes: { type: String, default: '' },
  adminResponse: { type: String, default: '' },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolvedAt: { type: Date, default: null }
}, { timestamps: true });

// Auto-generate ticketId if not provided
SupportTicketSchema.pre('save', function(next) {
  if (!this.ticketId) {
    this.ticketId = 'RM' + Date.now().toString().slice(-6);
  }
  next();
});

module.exports = mongoose.model('SupportTicket', SupportTicketSchema);
