const assistantRepo = require('../repositories/assistantRepository');
const approveDocuments = async (id, reviewerId) => assistantRepo.updateAssistant(id, { verified: true, documentReviewedBy: reviewerId, documentReviewedAt: new Date() });
const rejectDocuments = async (id, reviewerId) => assistantRepo.updateAssistant(id, { verified: false, documentReviewedBy: reviewerId, documentReviewedAt: new Date() });
module.exports = { approveDocuments, rejectDocuments };
