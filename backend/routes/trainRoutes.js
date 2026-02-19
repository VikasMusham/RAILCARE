const express = require('express');
const router = express.Router();
const trainController = require('../controllers/trainController');

router.get('/search-trains', trainController.searchTrains);
router.get('/train-status', trainController.getTrainStatus);

module.exports = router;
