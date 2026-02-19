const railwayApiService = require('../services/railwayApiService');

exports.searchTrains = async (req, res, next) => {
  try {
    const { q } = req.query;
    const trains = await railwayApiService.searchTrains(q);
    res.json(trains);
  } catch (err) {
    next(err);
  }
};

exports.getTrainStatus = async (req, res, next) => {
  try {
    const { train } = req.query;
    const status = await railwayApiService.getTrainStatus(train);
    res.json(status);
  } catch (err) {
    next(err);
  }
};
