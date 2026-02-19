const express = require('express');
const router = express.Router();
const assistantController = require('../controllers/assistantController');
const { adminOnly } = require('../middleware/authMiddleware');
router.get('/', adminOnly, assistantController.getAssistants);
router.post('/:id/approve', adminOnly, assistantController.approve);
router.post('/:id/reject', adminOnly, assistantController.reject);
router.delete('/:id', adminOnly, assistantController.deleteAssistant);
module.exports = router;
