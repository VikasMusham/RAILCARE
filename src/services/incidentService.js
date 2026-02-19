const incidentRepo = require('../repositories/incidentRepository');
const createIncident = async (data) => incidentRepo.createIncident(data);
const getIncidents = async (filter) => incidentRepo.findIncidents(filter);
module.exports = { createIncident, getIncidents };
