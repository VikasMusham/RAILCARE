const express = require('express');
const router = express.Router();
const incidentController = require('../controllers/incidentController');
const { adminOnly } = require('../middleware/authMiddleware');
router.get('/', adminOnly, incidentController.getIncidents);
router.post('/', adminOnly, incidentController.createIncident);
module.exports = router;
