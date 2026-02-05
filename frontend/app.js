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
    price: comp.total
  };

  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success && data.booking) {
      const b = data.booking;
      // Render detailed booking info for passenger
      let assistantHtml = 'Not assigned';
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
      // Thank you summary and hide booking form while an active booking exists
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
      // if logged-in passenger created this booking, refresh their bookings
      try {
        const user = await window.RailCareAuth?.getCurrentUser?.();
        if (user && user.role === 'passenger' && user.name === b.passengerName) {
          renderBookingsFor(user.name);
          startPassengerPolling(user.name);
        }
      } catch (e) { /* ignore */ }
    } else {
      result.textContent = JSON.stringify(data);
    }
  } catch (err) { result.textContent = 'Request failed: ' + err.message }
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
