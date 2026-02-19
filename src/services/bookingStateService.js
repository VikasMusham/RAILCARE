const allowedTransitions = {
  SEARCHING: ['ASSIGNED', 'CANCELLED', 'EMERGENCY'],
  ASSIGNED: ['ASSISTANT_EN_ROUTE', 'CANCELLED', 'EMERGENCY'],
  ASSISTANT_EN_ROUTE: ['IN_PROGRESS', 'CANCELLED', 'EMERGENCY'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED', 'EMERGENCY'],
  COMPLETED: [],
  CANCELLED: [],
  EMERGENCY: []
};
function canTransition(current, next) {
  return allowedTransitions[current]?.includes(next);
}
module.exports = { canTransition, allowedTransitions };
