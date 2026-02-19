const incidentService = require('../services/incidentService');
exports.createIncident = async (req, res, next) => {
  try {
    const incident = await incidentService.createIncident(req.body);
    res.json({ success: true, incident });
  } catch (err) { next(err); }
};
exports.getIncidents = async (req, res, next) => {
  try {
    const incidents = await incidentService.getIncidents(req.query);
    res.json({ success: true, incidents });
  } catch (err) { next(err); }
};
