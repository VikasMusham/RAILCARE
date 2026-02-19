const axios = require('axios');
require('dotenv').config();

const RAILWAY_API_BASE = process.env.RAILWAY_API_BASE;
const RAILWAY_API_KEY = process.env.RAILWAY_API_KEY;

exports.searchTrains = async (query) => {
  // Example: Call real railway API here
  const res = await axios.get(`${RAILWAY_API_BASE}/search`, {
    params: { q: query, apikey: RAILWAY_API_KEY }
  });
  // Map/validate response as needed
  return res.data.trains;
};

exports.getTrainStatus = async (trainNumber) => {
  const res = await axios.get(`${RAILWAY_API_BASE}/status`, {
    params: { train: trainNumber, apikey: RAILWAY_API_KEY }
  });
  return res.data.status;
};
