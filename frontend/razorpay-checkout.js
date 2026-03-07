// Razorpay checkout integration for passenger booking
// This script is loaded dynamically in app.js when payment is required

window.openRazorpayCheckout = function(order, bookingId, amount, onSuccess, onFailure) {
  const options = {
    key: 'rzp_test_SIkJ0K2Hzpfn0v', // Replace with your Razorpay key
    amount: order.amount,
    currency: order.currency,
    name: 'RailMitra Service Booking',
    description: 'Booking ID: ' + (bookingId || ''),
    order_id: order.id,
    handler: function(response) {
      // Only call onSuccess with payment details
      if (onSuccess) {
        onSuccess(response.razorpay_payment_id, order.id, response.razorpay_signature);
      }
    },
    prefill: {},
    theme: { color: '#3b82f6' }
  };
  const rzp = new window.Razorpay(options);
  rzp.on('payment.failed', function(response) {
    if (onFailure) onFailure(response.error);
  });
  rzp.open();
}
