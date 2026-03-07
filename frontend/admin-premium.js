// Modal for showing available assistants
function showAssistantsModal(station, bookingId) {
  const modalId = 'assistantsModal';
  let modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);z-index:9999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `<div style="background:#fff;padding:32px 24px;border-radius:12px;max-width:420px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.18);position:relative;">
      <button id="closeAssistantsModal" style="position:absolute;top:12px;right:16px;font-size:20px;background:none;border:none;cursor:pointer;">&times;</button>
      <h2 style="margin-bottom:18px;font-size:22px;">Available Assistants for <span style='color:#10b981;'>${station}</span></h2>
      <div id="assistantsList" style="max-height:320px;overflow-y:auto;"></div>
    </div>`;
    document.body.appendChild(modal);
    document.getElementById('closeAssistantsModal').onclick = () => modal.remove();
  } else {
    modal.style.display = 'flex';
  }
  const listDiv = modal.querySelector('#assistantsList');
  listDiv.innerHTML = '<div style="text-align:center;padding:16px;">Loading...</div>';
  window.authFetch(`/api/admin/dashboard/available-assistants?station=${encodeURIComponent(station)}`)
    .then(r => r.json())
    .then(data => {
      if (data.success && data.assistants && data.assistants.length > 0) {
        listDiv.innerHTML = `<div style='margin-bottom:10px;font-weight:600;'>Total: ${data.assistants.length}</div>` +
          data.assistants.map(a =>
            `<div style='padding:10px 0;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;'>
              <div>
                <div><b>${a.name}</b> <span style='color:#888;font-size:13px;'>(${a.phone})</span></div>
                <div style='font-size:13px;color:#666;'>${a.languages && a.languages.length ? 'Lang: ' + a.languages.join(', ') : ''}</div>
                <div style='font-size:13px;color:#666;'>${a.isOnline ? '<span style="color:#10b981;">Online</span>' : 'Offline'} | ${a.rating ? '⭐ ' + a.rating.toFixed(1) : 'No rating'}</div>
              </div>
              <button class='btn btn-success btn-sm' onclick='assignAssistantToBooking("${bookingId}","${a._id}")'>Assign</button>
            </div>`
          ).join('');
      } else {
        listDiv.innerHTML = '<div style="text-align:center;padding:24px;">No available assistants for this station.</div>';
      }
    })
    .catch(() => {
      listDiv.innerHTML = '<div style="text-align:center;padding:24px;color:#ef4444;">Error loading assistants.</div>';
    });
}

// Assign button handler (to be called from booking card)
window.showAssistantsForAssign = function(station, bookingId) {
  showAssistantsModal(station, bookingId);
};

// Assign assistant to booking (implement actual API call as needed)
window.assignAssistantToBooking = function(bookingId, assistantId) {
  if (!confirm('Assign this assistant to the booking?')) return;
  window.authFetch(`/api/admin/dashboard/reassign/${bookingId}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assistantId }) })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        alert('Assistant assigned!');
        document.getElementById('assistantsModal')?.remove();
        window.loadBookings && window.loadBookings();
      } else {
        alert('Failed to assign: ' + (data.message || 'Unknown error'));
      }
    })
    .catch(() => alert('Failed to assign assistant.'));
};
// Admin payment verification logic for UPI

// Use window.authFetch for all admin API calls to ensure Authorization header is sent
window.verifyPayment = async function(bookingId) {
  const txnInput = document.getElementById('adminTxnId-' + bookingId);
  const txnId = txnInput ? txnInput.value.trim() : '';
  // Transaction ID is optional - admin can verify based on screenshot alone
  if (!confirm('Are you sure you want to verify this payment as received?')) {
    return;
  }
  try {
    const res = await window.authFetch(`/api/admin/bookings/${bookingId}/verify-payment`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId: txnId || '' })
    });
    let data;
    try {
      data = await res.json();
    } catch (e) {
      data = { success: false, message: 'Invalid server response' };
    }
    if (res.ok && data.success) {
      alert('Payment marked as verified!');
      window.loadBookings && window.loadBookings();
    } else {
      alert('Failed to verify payment: ' + (data.message || 'Unknown error'));
    }
  } catch (err) {
    alert('Failed to verify payment: ' + err.message);
  }
};

window.markPaymentNotDone = async function(bookingId) {
  // Mark as COD (Cash on Delivery)
  try {
    const res = await window.authFetch(`/api/payment/cash-on-delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId })
    });
    let data;
    try {
      data = await res.json();
    } catch (e) {
      data = { success: false, message: 'Invalid server response' };
    }
    if (res.ok && data.success) {
      alert('Booking marked as Cash on Delivery.');
      window.loadBookings && window.loadBookings();
    } else {
      alert('Failed to mark as COD: ' + (data.message || 'Unknown error'));
    }
  } catch (err) {
    alert('Failed to mark as COD: ' + err.message);
  }
};
