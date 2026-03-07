// Minimal frontend JS for passenger booking with pricing
// enforce passenger-only access
window.RailCareAuth?.enforceRole && window.RailCareAuth.enforceRole('passenger');
const form = document.getElementById('bookingForm');
const result = document.getElementById('result');
const viewBtn = document.getElementById('viewBtn');
const viewName = document.getElementById('viewName');
const myBookings = document.getElementById('myBookings');
const serviceChecks = document.querySelectorAll('.serviceChk');
const insuranceChk = document.getElementById('insuranceChk');
const totalAmount = document.getElementById('totalAmount');
const breakdownItems = document.getElementById('breakdownItems');
const insuranceLine = document.getElementById('insuranceLine');

const PLATFORM_FEE = 10;

function computeTotal() {
  let services = [];
  let servicesCost = 0;
  serviceChecks.forEach(cb => {
    if (cb.checked) {
      services.push(cb.value);
      const p = parseFloat(cb.dataset.price) || 0;
      servicesCost += p;
    }
  });
  let insuranceCost = 0;
  if (insuranceChk && insuranceChk.checked) {
    insuranceCost = parseFloat(insuranceChk.dataset.price || 0);
  }
  // insurance only relevant if luggage selected
  const hasLuggage = services.includes('Luggage');
  if (!hasLuggage && insuranceChk) {
    insuranceChk.checked = false;
    insuranceLine.style.display = 'none';
  } else if (hasLuggage && insuranceChk) {
    insuranceLine.style.display = insuranceChk.checked ? 'block' : 'none';
  }

  const total = servicesCost + PLATFORM_FEE + insuranceCost;
  breakdownItems.textContent = `Services: ${services.join(', ') || '-'} — ₹${servicesCost.toFixed(2)}`;
  totalAmount.textContent = total.toFixed(2);
  return { services, servicesCost, insuranceCost, total };
}

function getStatusClass(status) {
  if (!status) return '';
  const s = status.toLowerCase();
  if (s.includes('pending') && s.includes('completion')) return 'status-completion-pending blink';
  if (s === 'pending') return 'status-pending blink';
  if (s === 'accepted') return 'status-accepted';
  if (s === 'in progress' || s === 'inprogress') return 'status-inprogress blink';
  if (s === 'completed') return 'status-completed';
  if (s === 'rejected') return 'status-rejected';
  return '';
}

serviceChecks.forEach(cb => cb.addEventListener('change', computeTotal));
if (insuranceChk) insuranceChk.addEventListener('change', computeTotal);
computeTotal();
const bookingCard = form ? form.closest('.card') : null;
// when user explicitly opens booking via menu, keep it visible until they close
window.bookingFormPinned = window.bookingFormPinned || false;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  // Prevent duplicate booking on refresh or double submit
  if (sessionStorage.getItem('booking_in_progress')) {
    result.innerHTML = '<div class="card"><h3>Booking in progress</h3><div>Please wait for the previous payment to complete.</div></div>';
    return;
  }
  sessionStorage.setItem('booking_in_progress', '1');
  const fd = new FormData(form);
  const comp = computeTotal();
  const payload = {
    passengerName: fd.get('passengerName'),
    station: fd.get('station'),
    trainName: fd.get('trainName'),
    coach: fd.get('coach'),
    seat: fd.get('seat'),
    services: comp.services,
    language: fd.get('language'),
    price: comp.total,
    amount: comp.total
  };

  // Show premium UPI payment modal
  const tempId = 'TMP' + Math.floor(Math.random()*1000000);
  const amount = payload.amount || payload.price || '';
  const upiString = `upi://pay?pa=9494628724-2@ybl&pn=RailMitra&am=${amount}&cu=INR&tn=Booking-${tempId}`;
  // Inject Lucide and Inter font if not present
  if (!document.getElementById('lucide-cdn')) {
    const lucide = document.createElement('link');
    lucide.rel = 'stylesheet';
    lucide.href = 'https://unpkg.com/lucide-static@latest/dist/lucide.css';
    lucide.id = 'lucide-cdn';
    document.head.appendChild(lucide);
  }
  if (!document.getElementById('inter-font-cdn')) {
    const inter = document.createElement('link');
    inter.rel = 'stylesheet';
    inter.href = 'https://fonts.googleapis.com/css?family=Inter:400,600&display=swap';
    inter.id = 'inter-font-cdn';
    document.head.appendChild(inter);
  }
  // Add premium payment modal markup
  result.innerHTML = `
    <div class="payment-bg">
      <div class="payment-card">
        <div class="payment-header">
          <i class="lucide lucide-credit-card payment-icon"></i>
          <h2>Complete Your Payment</h2>
          <div class="payment-amount">₹<span id="amount-value">${amount !== '' ? amount : '--'}</span></div>
          <div class="payment-subtitle">Scan the QR code or use UPI ID to complete payment.</div>
        </div>
        <div class="payment-qr-section">
          <div class="qr-container">
            <div id="upi-qr-code"></div>
          </div>
          <div class="upi-id-row">
            <i class="lucide lucide-qr-code"></i>
            <span class="upi-id-text" id="upi-id">949462724-2@ybl</span>
            <button type="button" class="copy-btn" id="copy-upi-btn">
              <i class="lucide lucide-copy"></i> Copy
            </button>
          </div>
        </div>
        <form id="upi-payment-form" enctype="multipart/form-data" autocomplete="off" style="margin-top:1.2rem;">
          <div class="form-group">
            <label for="transactionIdInput">
              <i class="lucide lucide-hash"></i> Enter UPI Transaction ID
            </label>
            <input type="text" id="transactionIdInput" name="transactionId" placeholder="Transaction/Reference ID" autocomplete="off" />
          </div>
          <div class="form-group">
            <label for="transactionProofInput">
              <i class="lucide lucide-upload"></i> Upload Payment Screenshot (Optional)
            </label>
            <input type="file" id="transactionProofInput" name="transactionProof" accept="image/*" hidden />
            <button type="button" class="upload-btn" id="upload-btn">
              <i class="lucide lucide-upload"></i> Choose File
            </button>
            <span id="file-chosen" class="file-chosen">No file chosen</span>
          </div>
          <div class="payment-actions">
            <button type="submit" class="btn btn-primary" id="sendTransactionBtn" disabled>
              <i class="lucide lucide-check-circle"></i> Submit UPI Payment
            </button>
            <button type="button" class="btn btn-secondary" id="pay-cod-btn">
              <i class="lucide lucide-wallet"></i> Pay Cash on Delivery
            </button>
            <button type="button" class="btn btn-danger" id="cancel-btn">
              <i class="lucide lucide-x-circle"></i> Cancel
            </button>
          </div>
          <div id="transactionStatus" class="transaction-status"></div>
        </form>
      </div>
    </div>
    <style>
body, .payment-bg { background: #F8FAFC; font-family: 'Inter', 'Poppins', system-ui, sans-serif; }
.payment-bg { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
.payment-card { background: #fff; border-radius: 20px; box-shadow: 0 8px 32px rgba(37,99,235,0.08), 0 1.5px 6px rgba(0,0,0,0.04); max-width: 420px; width: 100%; padding: 2.5rem 2rem 2rem 2rem; margin: 2rem; display: flex; flex-direction: column; gap: 1.5rem; animation: fadeIn 0.7s cubic-bezier(.4,0,.2,1); }
@keyframes fadeIn { from { opacity: 0; transform: translateY(30px);} to { opacity: 1; transform: none;} }
.payment-header { text-align: center; margin-bottom: 0.5rem; }
.payment-icon { font-size: 2.2rem; color: #2563EB; margin-bottom: 0.5rem; }
.payment-header h2 { font-size: 1.6rem; font-weight: 700; margin: 0 0 0.3rem 0; letter-spacing: -0.5px; }
.payment-amount { font-size: 2.1rem; font-weight: 700; color: #2563EB; background: linear-gradient(90deg, #2563EB 60%, #60A5FA 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 0.2rem; }
.payment-subtitle { color: #64748B; font-size: 1rem; margin-bottom: 0.5rem; }
.payment-qr-section { display: flex; flex-direction: column; align-items: center; gap: 0.7rem; }
.qr-container { background: #F1F5F9; border: 2.5px solid #2563EB; border-radius: 16px; padding: 1.1rem; display: flex; align-items: center; justify-content: center; margin-bottom: 0.2rem; }
#upi-qr-code { width: 180px; height: 180px; }
.upi-id-row { display: flex; align-items: center; gap: 0.5rem; font-size: 1.08rem; color: #334155; margin-top: 0.2rem; }
.upi-id-text { font-weight: 600; letter-spacing: 0.5px; }
.copy-btn { background: #EFF6FF; color: #2563EB; border: none; border-radius: 6px; padding: 0.25rem 0.7rem; font-size: 0.98rem; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; gap: 0.3rem; }
.copy-btn:hover { background: #DBEAFE; }
.form-group { margin-bottom: 1.1rem; display: flex; flex-direction: column; gap: 0.4rem; }
.form-group label { font-weight: 600; color: #2563EB; font-size: 1rem; display: flex; align-items: center; gap: 0.4rem; }
input[type="text"] { border: 1.5px solid #CBD5E1; border-radius: 8px; padding: 0.7rem 1rem; font-size: 1.08rem; outline: none; transition: border 0.2s, box-shadow 0.2s; background: #F8FAFC; }
input[type="text"]:focus { border-color: #2563EB; box-shadow: 0 0 0 2px #2563EB22; }
.upload-btn { background: #EFF6FF; color: #2563EB; border: none; border-radius: 7px; padding: 0.5rem 1.1rem; font-size: 1rem; cursor: pointer; margin-right: 0.7rem; display: inline-flex; align-items: center; gap: 0.4rem; transition: background 0.2s; }
.upload-btn:hover { background: #DBEAFE; }
.file-chosen { font-size: 0.98rem; color: #64748B; }
.payment-actions { display: flex; gap: 0.7rem; margin-top: 0.7rem; flex-wrap: wrap; justify-content: center; }
.btn { font-family: inherit; font-size: 1.08rem; font-weight: 600; border: none; border-radius: 8px; padding: 0.7rem 1.5rem; cursor: pointer; transition: box-shadow 0.18s, background 0.18s, color 0.18s, border 0.18s; display: flex; align-items: center; gap: 0.5rem; }
.btn-primary { background: linear-gradient(90deg, #2563EB 60%, #60A5FA 100%); color: #fff; box-shadow: 0 2px 8px #2563EB22; }
.btn-primary:hover { background: linear-gradient(90deg, #1D4ED8 60%, #2563EB 100%); box-shadow: 0 4px 16px #2563EB33; }
.btn-secondary { background: #F1F5F9; color: #2563EB; border: 1.5px solid #2563EB; }
.btn-secondary:hover { background: #DBEAFE; color: #1D4ED8; }
.btn-danger { background: #FEE2E2; color: #DC2626; border: 1.5px solid #DC2626; }
.btn-danger:hover { background: #FCA5A5; color: #fff; }
.transaction-status { margin-top: 0.7rem; font-size: 1.05rem; min-height: 1.2em; color: #2563EB; text-align: center; transition: color 0.2s; }
    </style>`;
  // Lucide icons init
  if (window.lucide && window.lucide.createIcons) setTimeout(() => window.lucide.createIcons(), 100);
  // QR code rendering
  function renderQRCode() {
    if (window.QRCode) {
      new window.QRCode(document.getElementById('upi-qr-code'), {
        text: upiString,
        width: 180,
        height: 180,
        colorDark: '#000',
        colorLight: '#fff',
        correctLevel: window.QRCode.CorrectLevel.H
      });
    }
    if (!window.QRCode) {
      const qrScript = document.createElement('script');
      qrScript.src = 'QRCode.js';
      qrScript.onload = renderQRCode;
      document.body.appendChild(qrScript);
    } else {
      renderQRCode();
    }
    // File upload button logic
    document.getElementById('upload-btn').onclick = function() {
      document.getElementById('transactionProofInput').click();
    };
    document.getElementById('transactionProofInput').onchange = function() {
      const file = this.files[0];
      document.getElementById('file-chosen').textContent = file ? file.name : 'No file chosen';
    };
    // Copy UPI ID logic
    document.getElementById('copy-upi-btn').onclick = function() {
      const upi = document.getElementById('upi-id').textContent;
      navigator.clipboard.writeText(upi);
      document.getElementById('copy-upi-btn').textContent = 'Copied!';
      setTimeout(() => { document.getElementById('copy-upi-btn').innerHTML = '<i class="lucide lucide-copy"></i> Copy'; if(window.lucide && window.lucide.createIcons) window.lucide.createIcons(); }, 1200);
    };
    // Timer logic
    let timeLeft = 300;
    const timerDiv = document.createElement('div');
    timerDiv.id = 'qr-timer';
    timerDiv.style.fontSize = '15px';
    timerDiv.style.color = '#ef4444';
    timerDiv.style.marginBottom = '10px';
    document.querySelector('.payment-qr-section').prepend(timerDiv);
    function updateTimer() {
      const min = Math.floor(timeLeft/60);
      const sec = (timeLeft%60).toString().padStart(2,'0');
      timerDiv.textContent = `Session expires in ${min}:${sec}`;
      if (timeLeft <= 0) {
        timerDiv.textContent = 'Session expired. Please refresh to try again.';
        document.getElementById('sendTransactionBtn').disabled = true;
      } else {
        timeLeft--;
        setTimeout(updateTimer, 1000);
      }
    }
    updateTimer();
    // Enable send if either transaction ID or screenshot is present
    const txnInput = document.getElementById('transactionIdInput');
    const proofInput = document.getElementById('transactionProofInput');
    function updateSendBtnState() {
      const txnVal = txnInput.value.trim();
      const proofVal = proofInput && proofInput.files && proofInput.files.length > 0;
      document.getElementById('sendTransactionBtn').disabled = !(txnVal || proofVal);
    }
    txnInput.addEventListener('input', updateSendBtnState);
    proofInput.addEventListener('change', updateSendBtnState);
    // Form submission logic (preserve original logic)
    document.getElementById('upi-payment-form').onsubmit = function(e) {
      e.preventDefault();
      document.getElementById('sendTransactionBtn').click();
    };
  };

  document.getElementById('pay-cod-btn').onclick = async () => {
    if (confirm('You have selected Cash on Delivery. Confirm booking?')) {
      // Only now create booking for COD, ensure paymentMethod and paymentStatus are set
      const codPayload = { ...payload, paymentMethod: 'Cash on Delivery', paymentStatus: 'Pending' };
      const fetcher = window.RailCareAuth?.authFetch || fetch;
      const res = await fetcher('/api/bookings/cod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(codPayload)
      });
      const data = await res.json();
      if (data.success && data.booking) {
        let assistantHtml = 'Not assigned';
        const b = data.booking;
        if (b.assistantId) {
          if (typeof b.assistantId === 'object') {
            assistantHtml = `<strong>${b.assistantId.name}</strong> — ${b.assistantId.station} ${b.assistantId.verified? '(verified)':''}`;
          } else {
            try {
              const r = await fetcher(`/api/assistants/${b.assistantId}`);
              const da = await r.json();
              if (da.success && da.assistant) assistantHtml = `<strong>${da.assistant.name}</strong> — ${da.assistant.station} ${da.assistant.verified? '(verified)':''}`;
              else assistantHtml = b.assistantId;
            } catch (e) { assistantHtml = b.assistantId; }
          }
        }
        const statusClass = getStatusClass(b.status);
        result.innerHTML = `<div class="card">
          <h3>Thank you for booking</h3>
          <div><strong>${b.passengerName}</strong> — ${b.station}</div>
          <div>Status: <span class="status-badge ${statusClass}">${b.status}</span></div>
          <div>Start OTP: ${b.otp||'-'}</div>
          <div>Completion OTP: ${b.completionOtp||'-'}</div>
        </div>`;
        if (bookingCard && !window.bookingFormPinned) bookingCard.style.display = 'none';
        form.reset();
        computeTotal();
        sessionStorage.removeItem('booking_in_progress');
        try {
          const user = await window.RailCareAuth?.getCurrentUser?.();
          if (user && user.role === 'passenger' && user.name === b.passengerName) {
            renderBookingsFor(user.name);
            startPassengerPolling(user.name);
          }
        } catch (e) { /* ignore */ }
      } else {
        result.textContent = JSON.stringify(data);
        sessionStorage.removeItem('booking_in_progress');
      }
    } else {
      result.innerHTML = '<div class="card"><h3>Booking failed</h3><div>Booking not created. Please confirm Cash on Delivery to proceed.</div></div>';
      sessionStorage.removeItem('booking_in_progress');
      return;
    }
  };
// Razorpay payment trigger and callback logic

function showPaymentFallback(payload) {
  result.innerHTML = `<div class="card">
    <h3>Razorpay unavailable</h3>
    <div>Online payment could not be loaded. Please use an alternative payment method below:</div>
    <button id="fallback-upi-btn" class="btn btn-info" style="margin:12px 0;">Pay via UPI QR</button>
    <button id="fallback-cod-btn" class="btn btn-warning" style="margin:12px 0;">Cash at Station</button>
  </div>`;
  document.getElementById('fallback-upi-btn').onclick = () => {
    // Trigger UPI QR flow
    form.dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}));
  };
  document.getElementById('fallback-cod-btn').onclick = () => {
    // Trigger COD flow
    form.querySelector('[name="paymentMethod"]').value = 'Cash on Delivery';
    form.dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}));
  };
}

function triggerRazorpayPayment(order, payload) {
  // Try to load Razorpay checkout script
  let loaded = false;
  const script = document.createElement('script');
  script.src = 'https://checkout.razorpay.com/v1/checkout.js';
  script.onload = () => {
    loaded = true;
    try {
      startRazorpayPayment(order, payload);
    } catch (e) {
      showPaymentFallback(payload);
    }
  };
  script.onerror = () => {
    showPaymentFallback(payload);
  };
  setTimeout(() => {
    if (!loaded) showPaymentFallback(payload);
  }, 6000);
  document.head.appendChild(script);
}


function startRazorpayPayment(order, payload) {
  // Try popup first, fallback to hosted checkout if blocked
  let paymentCompleted = false;
  const options = {
    key: order.key_id || '',
    amount: order.amount,
    currency: 'INR',
    name: 'RailMitra',
    description: 'Booking Payment',
    order_id: order.id,
    handler: async function (response) {
      paymentCompleted = true;
      // Call backend to verify payment and create booking
      try {
        const verifyRes = await fetch('/api/payments/verify-and-book', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payment_id: response.razorpay_payment_id,
            order_id: response.razorpay_order_id,
            signature: response.razorpay_signature,
            bookingData: payload
          })
        });
        const verifyData = await verifyRes.json();
        if (verifyData.success && verifyData.booking) {
          result.innerHTML = `<div class="card"><h3>Payment successful</h3><div>Your booking is confirmed!</div></div>`;
          renderBookingsFor(payload.passengerName);
        } else {
          result.innerHTML = `<div class="card"><h3>Booking failed</h3><div>Payment verification failed or booking not created.</div></div>`;
        }
      } catch (err) {
        result.innerHTML = `<div class="card"><h3>Booking failed</h3><div>Network error. Please try again.</div></div>`;
      }
    },
    modal: {
      ondismiss: function () {
        if (!paymentCompleted) {
          result.innerHTML = `<div class="card"><h3>Payment Cancelled</h3><div>Payment was not completed. Please try again or use another payment method.</div></div>`;
          showPaymentFallback(payload);
        }
      }
    }
  };
  try {
    const rzp = new window.Razorpay(options);
    rzp.open();
  } catch (e) {
    // Popup blocked or error, fallback to hosted checkout
    window.location.href = `https://checkout.razorpay.com/v1/checkout.js?order_id=${order.id}`;
  }
}
});

// render bookings list for a passenger name
async function renderBookingsFor(name) {
  if (!name) return;
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher(`/api/bookings?passengerName=${encodeURIComponent(name)}`);
    const list = await res.json();
    myBookings.innerHTML = '';
    if (!list.length) myBookings.textContent = 'No bookings found';
    // hide booking form if there is any non-completed booking, unless user pinned it via Menu
    try {
      const hasActive = list.some(b => (b.status || '').toLowerCase() !== 'completed');
      if (bookingCard) {
        if (window.bookingFormPinned) {
          // if pinned, always keep visible
          bookingCard.style.display = 'block';
        } else {
          bookingCard.style.display = hasActive ? 'none' : 'block';
        }
      }
      if (!hasActive && !window.bookingFormPinned) result.innerHTML = '';
    } catch (e) {}
    for (const b of list) {
      const el = document.createElement('div');
      el.className = 'card';
      let assistantText = 'Not assigned';
      if (b.assistantId) {
        try {
          const fetcher2 = window.RailCareAuth?.authFetch || fetch;
          const r = await fetcher2(`/api/assistants/${b.assistantId}`);
          const da = await r.json();
          if (da.success && da.assistant) assistantText = da.assistant.name + (da.assistant.verified? ' (verified)':' (unverified)');
          else assistantText = b.assistantId;
        } catch (e) { assistantText = b.assistantId; }
      }
            const sc = getStatusClass(b.status);
            let feedbackHtml = '';
            // If completed, check whether feedback exists; if not, show feedback form
            if ((b.status || '').toLowerCase() === 'completed') {
              try {
                const ff = await (window.RailCareAuth?.authFetch || fetch)(`/api/feedback/booking/${b._id}`);
                const jf = await ff.json();
                if (jf.success && jf.found) {
                  feedbackHtml = `<div class="muted">You rated this booking: ${jf.feedback.rating} / 5 — ${jf.feedback.comments||''}</div>`;
                } else {
                  feedbackHtml = `<div style="margin-top:8px">Rate your assistant: <select class="fbRating" data-id="${b._id}"><option value="5">5</option><option value="4">4</option><option value="3">3</option><option value="2">2</option><option value="1">1</option></select>
                    <div><textarea class="fbComments" data-id="${b._id}" placeholder="Comments (optional)" style="width:100%;height:60px;margin-top:6px"></textarea></div>
                    <div style="margin-top:6px"><button class="submitFeedback" data-id="${b._id}">Submit Feedback</button></div></div>`;
                }
              } catch (e) { feedbackHtml = '' }
            }
            el.innerHTML = `<div><strong>${b.passengerName}</strong> — ${b.station} — <span class="status-badge ${sc}">${b.status}</span></div>
              <div>Train: ${b.trainName||'-'} Coach/Seat: ${b.coach||''}/${b.seat||''}</div>
              <div>Assistant: ${assistantText}</div>
              <div>Start OTP: ${b.otp || '-'}</div>
              <div>Completion OTP: ${b.completionOtp || '-'}</div>
              ${feedbackHtml}`;
      myBookings.appendChild(el);
    }
        // attach feedback submit handlers
        myBookings.querySelectorAll('.submitFeedback').forEach(btn => btn.addEventListener('click', async (e) => {
          const id = e.target.dataset.id;
          const rating = parseInt(document.querySelector(`.fbRating[data-id="${id}"]`).value, 10);
          const comments = document.querySelector(`.fbComments[data-id="${id}"]`).value.trim();
          try {
            const fetcher = window.RailCareAuth?.authFetch || fetch;
            const res = await fetcher('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: id, rating, comments }) });
            const j = await res.json();
            if (j.success) { alert('Thank you for your feedback'); renderBookingsFor(viewName.value); }
            else alert('Feedback failed: ' + (j.message||JSON.stringify(j)));
          } catch (err) { alert(err.message) }
        }));
  } catch (err) { /* ignore */ }
}

// expose helpers for header menu
window.renderBookingsFor = renderBookingsFor;
window.startPassengerPolling = startPassengerPolling;
function _addBookingClose(btnWrap) {
  if (!btnWrap) return;
  if (document.getElementById('closeBookingFormBtn')) return;
  const c = document.createElement('button');
  c.id = 'closeBookingFormBtn';
  c.textContent = 'Close Booking Form';
  c.className = 'btn-secondary';
  c.style.marginLeft = '8px';
  c.addEventListener('click', () => {
    window.bookingFormPinned = false;
    if (bookingCard) {
      // hide only if there is an active booking
      try {
        const name = document.getElementById('viewName')?.value || '';
        // re-render to apply auto-hide rules
        window.renderBookingsFor?.(name);
      } catch (e) { if (bookingCard) bookingCard.style.display = 'block'; }
    }
  });
  btnWrap.appendChild(c);
}

function showBookingForm(name) {
  const form = document.getElementById('bookingForm');
  const card = form ? form.closest('.card') : null;
  if (card) {
    window.bookingFormPinned = true;
    card.style.display = 'block';
    // add a close button next to form actions (or at top)
    _addBookingClose(card);
    if (name) {
      const vn = document.getElementById('viewName'); if (vn) vn.value = name;
      const inpf = document.querySelector('input[name="passengerName"]'); if (inpf) inpf.value = name;
    }
    card.scrollIntoView({ behavior: 'smooth' });
  }
}
window.showBookingForm = showBookingForm;

if (viewBtn) {
  viewBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const name = viewName.value.trim();
    if (!name) return alert('Enter your name');
    await renderBookingsFor(name);
    startPassengerPolling(name);
  });
}

      let _passengerPoll = null;
      function startPassengerPolling(name) {
        stopPassengerPolling();
        _passengerPoll = setInterval(async () => {
          try {
            await renderBookingsFor(name);
            // no passenger-side confirmation handlers
          } catch (err) {
            // ignore polling errors
          }
        }, 5000);
      }

      function stopPassengerPolling() {
        if (_passengerPoll) clearInterval(_passengerPoll);
        _passengerPoll = null;
      }

      // on page load, if passenger is logged in show their bookings automatically
      document.addEventListener('DOMContentLoaded', async () => {
        try {
          const user = await window.RailCareAuth?.getCurrentUser?.();
          if (user && user.role === 'passenger') {
            if (viewName) viewName.value = user.name;
            renderBookingsFor(user.name);
            startPassengerPolling(user.name);
          }
        } catch (e) { /* ignore */ }
      });
