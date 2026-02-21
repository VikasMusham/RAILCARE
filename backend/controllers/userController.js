// backend/controllers/userController.js
const User = require('../models/User');

// GET /api/admin/user-stats
exports.getUserStats = async (req, res) => {
  try {
    // Group users by role and get details
    const users = await User.find({}, { password: 0 });
    const grouped = {};
    users.forEach(u => {
      if (!grouped[u.role]) grouped[u.role] = [];
      grouped[u.role].push(u);
    });
    const summary = Object.keys(grouped).map(role => ({
      role,
      count: grouped[role].length,
      users: grouped[role]
    }));
    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
