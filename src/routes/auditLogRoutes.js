const express = require('express');
const router = express.Router();
const auditLogController = require('../controllers/auditLogController');
const { adminOnly } = require('../middleware/authMiddleware');
router.get('/', adminOnly, auditLogController.getLogs);
module.exports = router;
