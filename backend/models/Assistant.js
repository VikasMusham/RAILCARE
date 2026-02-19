const mongoose = require('mongoose');

const AssistantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: false, trim: true },
  age: { type: Number, required: false },
  userId: { type: String, required: false, index: true },
  station: { type: String, required: true, trim: true },
  languages: [{ type: String, trim: true }],
  permanentAddress: { type: String, default: '' },
  yearsOfExperience: { type: Number, default: 0 },
  
  // Application workflow fields (Uber-like onboarding)
  hasApplied: { type: Boolean, default: false },
  applicationStatus: {
    type: String,
    enum: ['Not Applied', 'Pending', 'Approved', 'Rejected'],
    default: 'Not Applied'
  },
  editableApplication: { type: Boolean, default: true },
  applicationDate: { type: Date, default: null },
  approvalDate: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },
  
  // Smart Matching Fields
  isOnline: { type: Boolean, default: false },
  lastOnlineAt: { type: Date, default: null },
  isEligibleForBookings: { type: Boolean, default: false },
  currentBookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  totalBookingsCompleted: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  
  // Document file paths (Multer uploads)
  aadharFilePath: { type: String, default: null },
  panFilePath: { type: String, default: null },
  photoFilePath: { type: String, default: null },
  
  // Legacy base64 documents (for backward compatibility)
  documents: {
    aadhar: { type: String, default: null },
    pan: { type: String, default: null }
  },
  
  // Verification status
  verified: { type: Boolean, default: false },
  documentsVerified: { type: Boolean, default: false },
  documentsRemark: { type: String, default: '' },

  // Revocation status
  revoked: { type: Boolean, default: false },
  
  // Rating
  rating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 }
}, { timestamps: true });

// Ensure one assistant per userId when set
AssistantSchema.index({ userId: 1 }, { unique: true, sparse: true });
AssistantSchema.index({ station: 1, isOnline: 1, applicationStatus: 1 });

// Virtual to get all document URLs
AssistantSchema.virtual('documentUrls').get(function() {
  return {
    aadhar: this.aadharFilePath || this.documents?.aadhar || null,
    pan: this.panFilePath || this.documents?.pan || null,
    photo: this.photoFilePath || null
  };
});

// Ensure virtuals are included in JSON output
AssistantSchema.set('toJSON', { virtuals: true });
AssistantSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Assistant', AssistantSchema);
