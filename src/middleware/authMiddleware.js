const jwt = require('jsonwebtoken');
exports.adminOnly = (req, res, next) => {
  // TODO: verify JWT, check role === 'admin'
  next();
};
