exports.getRecommendedArrival = (expectedArrival) => {
  // Subtract 20 minutes from expected arrival
  const arrival = new Date(expectedArrival);
  arrival.setMinutes(arrival.getMinutes() - 20);
  return `Please reach the station by ${arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} for smooth assistance.`;
};
