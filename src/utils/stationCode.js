// Utility to normalize station codes (uppercase, trimmed)
function normalizeStationCode(code) {
  if (!code) return '';
  return code.trim().toUpperCase();
}

module.exports = { normalizeStationCode };
