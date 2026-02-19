const Incident = require('../models/Incident');
const createIncident = async (data) => Incident.create(data);
const findIncidents = async (filter) => Incident.find(filter).sort({ createdAt: -1 });
module.exports = { createIncident, findIncidents };
