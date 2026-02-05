// assistant.js - interact with assistant endpoints
let assistant = null;
const registerBtn = document.getElementById('registerBtn');
const refreshBtn = document.getElementById('refreshBtn');
const bookingsList = document.getElementById('bookingsList');
const assistantInfo = document.getElementById('assistantInfo');

// Try to load assistant id from localStorage or link a logged-in assistant user
const LS_KEY = 'railmitra_assistantId';
const storedId = localStorage.getItem(LS_KEY);
let currentUser = null;

async function loadCurrentUser() {
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher('/api/auth/me');
    if (!res.ok) return null;
    const j = await res.json();
    return j.success ? j.user : null;
  } catch (e) { return null; }
}

// Check dashboard access before loading page
async function checkDashboardAccess() {
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher('/api/assistants/dashboard-access');
    const data = await res.json();
    
    if (!data.success || !data.canAccess) {
      // Redirect based on application status
      const redirect = data.redirect || '/assistant-apply.html';
      console.log('[Dashboard] Access denied, redirecting to:', redirect);
      window.location.href = redirect;
      return false;
    }
    
    // Store assistant data
    if (data.assistant) {
      assistant = data.assistant;
      try { localStorage.setItem(LS_KEY, assistant._id); } catch (e) {}
    }
    
    return true;
  } catch (err) {
    console.error('[Dashboard] Access check error:', err);
    // On error, redirect to apply page
    window.location.href = 'assistant-apply.html';
    return false;
  }
}

(async () => {
  // enforce assistant-only access
  await window.RailCareAuth?.enforceRole?.('assistant');
  
  // Check if user has approved application before allowing dashboard access
  const hasAccess = await checkDashboardAccess();
  if (!hasAccess) return;
  
  // If we have access, render the dashboard
  if (assistant) {
    renderAssistant();
    startAssistantPolling();
    loadBookings();
  }
})();

// Legacy initialization (fallback)
(async () => {
  // Wait a bit to let the access check complete
  await new Promise(r => setTimeout(r, 500));
  
  if (assistant) return; // Already loaded via dashboard-access
  
  currentUser = await loadCurrentUser();
  if (currentUser && currentUser.role === 'assistant') {
    try {
      const fetcher = window.RailCareAuth?.authFetch || fetch;
      const r = await fetcher('/api/assistants');
      const list = await r.json();
      const found = list.find(a => (a.userId && (a.userId.toString() === (currentUser.id || '').toString())) || a.name === currentUser.name);
      if (found) {
        // Check if approved
        if (found.applicationStatus !== 'Approved') {
          window.location.href = 'assistant-status.html';
          return;
        }
        assistant = found;
        try { localStorage.setItem(LS_KEY, assistant._id); } catch (e) {}
        renderAssistant();
        startAssistantPolling();
        loadBookings();
        return;
      }
    } catch (e) { /* ignore */ }
  }

  if (storedId) {
    try {
      const fetcher = window.RailCareAuth?.authFetch || fetch;
      const res = await fetcher(`/api/assistants/${storedId}`);
      const data = await res.json();
      if (data.success && data.assistant) {
        // Check if approved
        if (data.assistant.applicationStatus !== 'Approved') {
          window.location.href = 'assistant-status.html';
          return;
        }
        assistant = data.assistant;
        renderAssistant();
        startAssistantPolling();
        loadBookings();
      } else {
        localStorage.removeItem(LS_KEY);
      }
    } catch (err) { localStorage.removeItem(LS_KEY); }
  }
})();

registerBtn?.addEventListener('click', async () => {
  const name = document.getElementById('aName').value.trim();
  const station = document.getElementById('aStation').value.trim();
  const langs = document.getElementById('aLangs').value.split(',').map(s=>s.trim()).filter(Boolean);
  if (!name || !station) return alert('Fill name and station');
  try {
    // prevent duplicate registration: check existing assistants by name+station
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    try {
      const listRes = await fetcher('/api/assistants');
      const list = await listRes.json();
      const dup = list.find(a => a.name === name && a.station === station);
      if (dup) {
        assistant = dup;
        try { localStorage.setItem(LS_KEY, assistant._id); } catch(e){}
        renderAssistant(); loadBookings(); startAssistantPolling();
        return alert('You have already applied for this station — edit profile if needed.');
      }
    } catch (e) {
      // ignore list fetch errors and continue to registration
    }

    // proceed with registration (if logged-in, authFetch will include token so backend can associate userId)
    const res = await fetcher('/api/assistants/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, station, languages: langs })
    });
    const data = await res.json();
    if (data.success) {
      assistant = data.assistant;
      // persist assistant id so page reloads keep identity
      try { localStorage.setItem(LS_KEY, assistant._id); } catch (e) {}
      renderAssistant();
      loadBookings();
      // start short polling to refresh assistant verification status
      startAssistantPolling();
    } else alert('Register failed: ' + (data.message||JSON.stringify(data)));
  } catch (err) { alert(err.message) }
});

refreshBtn.addEventListener('click', loadBookings);

function renderAssistant() {
  if (!assistant) return assistantInfo.innerHTML = '';
  
  // Hide registration form if assistant is verified
  const registerFormSection = document.getElementById('registerFormSection');
  const registerCard = document.getElementById('registerCard');
  if (assistant.verified && registerFormSection) {
    registerFormSection.style.display = 'none';
    // Update card heading
    const heading = registerCard?.querySelector('h2');
    if (heading) heading.textContent = 'Your Assistant Profile';
  } else if (registerFormSection) {
    registerFormSection.style.display = 'block';
    const heading = registerCard?.querySelector('h2');
    if (heading) heading.textContent = 'Register / Load Assistant';
  }
  
  const ratingLine = assistant.rating ? `<div>Rating: ${assistant.rating.toFixed(1)} / 5 (${assistant.ratingCount||0})</div>` : '<div>No ratings yet</div>';
  const verifiedBadge = assistant.verified 
    ? '<span style="background:#28a745;color:white;padding:2px 8px;border-radius:4px;font-size:12px">✔ Verified</span>'
    : '<span style="background:#ffc107;color:#333;padding:2px 8px;border-radius:4px;font-size:12px">⏳ Pending Approval</span>';
  
  assistantInfo.innerHTML = `<strong style="font-size:18px">${assistant.name}</strong> — ${assistant.station}<br>
    <div style="margin-top:6px">${verifiedBadge}</div>
    ${ratingLine}
    <div style="margin-top:8px"><button id="editAssistantBtn" class="btn-secondary">Edit Profile</button> <button id="viewFeedbackBtn" class="btn-secondary">View Feedback</button></div>
    <div id="assistantDocs" style="margin-top:8px"></div>`;
  const editBtn = document.getElementById('editAssistantBtn');
  if (editBtn) editBtn.addEventListener('click', () => showAssistantEdit());
  const viewFb = document.getElementById('viewFeedbackBtn');
  if (viewFb) viewFb.addEventListener('click', () => showAssistantFeedback());
  // show document upload UI and existing documents
  const docsWrap = document.getElementById('assistantDocs');
  if (docsWrap) {
    // Get document URLs (support both new Multer paths and legacy)
    const aadharUrl = assistant.aadharFilePath || assistant.documents?.aadhar || null;
    const panUrl = assistant.panFilePath || assistant.documents?.pan || null;
    const photoUrl = assistant.photoFilePath || null;
    
    // Check document verification status
    const isVerified = assistant.documentsVerified === true;
    const remark = assistant.documentsRemark || '';
    const isOnHold = remark.toLowerCase().includes('hold');
    const isRejected = remark.toLowerCase().includes('reject') || remark.toLowerCase().includes('cancel');
    
    // Determine if upload form should be shown
    const showUploadForm = !isVerified && (isOnHold || isRejected || !aadharUrl || !panUrl);

    let inner = '<strong>📄 Documents</strong>';
    
    // Show status badge
    if (isVerified) {
      inner += '<div style="margin-top:8px;padding:12px;background:#d4edda;border:1px solid #c3e6cb;border-radius:6px;text-align:center">';
      inner += '<span style="font-size:24px">✅</span><br>';
      inner += '<strong style="color:#155724;font-size:16px">Documents Verified</strong><br>';
      inner += '<span style="color:#155724">Your documents have been verified by admin. No action needed.</span>';
      inner += '</div>';
    } else if (isOnHold) {
      inner += '<div style="margin-top:8px;padding:12px;background:#fff3cd;border:1px solid #ffc107;border-radius:6px">';
      inner += '<span style="font-size:20px">⏸️</span> <strong style="color:#856404">Documents On Hold</strong><br>';
      inner += '<span style="color:#856404">Admin has put your documents on hold. Please re-upload corrected documents.</span>';
      if (remark) inner += '<div style="margin-top:8px;padding:8px;background:#ffe69c;border-radius:4px;font-size:13px"><strong>Admin Remark:</strong> ' + remark.replace(/^HOLD:\s*/i, '') + '</div>';
      inner += '</div>';
    } else if (isRejected) {
      inner += '<div style="margin-top:8px;padding:12px;background:#f8d7da;border:1px solid #f5c6cb;border-radius:6px">';
      inner += '<span style="font-size:20px">❌</span> <strong style="color:#721c24">Documents Rejected</strong><br>';
      inner += '<span style="color:#721c24">Your documents were rejected. Please upload valid documents.</span>';
      if (remark) inner += '<div style="margin-top:8px;padding:8px;background:#f1b0b7;border-radius:4px;font-size:13px"><strong>Reason:</strong> ' + remark.replace(/^REJECTED:\s*/i, '') + '</div>';
      inner += '</div>';
    } else if (aadharUrl || panUrl) {
      inner += '<div style="margin-top:8px;padding:12px;background:#cce5ff;border:1px solid #b8daff;border-radius:6px">';
      inner += '<span style="font-size:20px">⏳</span> <strong style="color:#004085">Documents Pending Review</strong><br>';
      inner += '<span style="color:#004085">Your documents are uploaded and waiting for admin verification.</span>';
      inner += '</div>';
    }
    
    // Show uploaded document links (for all statuses)
    inner += '<div style="margin-top:12px">';
    inner += '<div style="margin-top:6px">Aadhar: ' + (aadharUrl ? `<a href="${aadharUrl}" target="_blank">View</a> <span style="color:green">✔</span>` : '<span style="color:#888">Not uploaded</span>') + '</div>';
    inner += '<div style="margin-top:6px">PAN: ' + (panUrl ? `<a href="${panUrl}" target="_blank">View</a> <span style="color:green">✔</span>` : '<span style="color:#888">Not uploaded</span>') + '</div>';
    if (photoUrl) {
      inner += '<div style="margin-top:6px">Photo: <a href="' + photoUrl + '" target="_blank">View</a> <span style="color:green">✔</span></div>';
    }
    inner += '</div>';
    
    // Only show upload form if NOT verified (on hold, rejected, or not yet uploaded)
    if (showUploadForm) {
      inner += `<div style="margin-top:12px; padding:12px; background:#f8f9fa; border-radius:4px;">
        <div style="margin-bottom:4px;font-weight:600;color:#333">${isOnHold || isRejected ? '📤 Re-upload Documents' : '📤 Upload Documents'}</div>
        <div style="margin-bottom:8px">
          <label style="display:block;font-weight:600;margin-bottom:4px">Upload Aadhar</label>
          <input type="file" id="uploadAadhar" accept=".jpg,.jpeg,.png,.pdf" style="width:100%" />
        </div>
        <div style="margin-bottom:8px">
          <label style="display:block;font-weight:600;margin-bottom:4px">Upload PAN</label>
          <input type="file" id="uploadPan" accept=".jpg,.jpeg,.png,.pdf" style="width:100%" />
        </div>
        <div style="margin-bottom:8px">
          <label style="display:block;font-weight:600;margin-bottom:4px">Upload Photo</label>
          <input type="file" id="uploadPhoto" accept=".jpg,.jpeg,.png" style="width:100%" />
        </div>
        <button id="uploadDocsBtn" class="btn-primary" disabled style="opacity:0.6;width:100%;margin-top:8px">Upload Documents</button>
        <div id="uploadStatus" style="margin-top:8px;text-align:center"></div>
      </div>`;
    }
    
    docsWrap.innerHTML = inner;

    const aIn = document.getElementById('uploadAadhar');
    const pIn = document.getElementById('uploadPan');
    const photoIn = document.getElementById('uploadPhoto');
    const uploadBtn = document.getElementById('uploadDocsBtn');
    const statusDiv = document.getElementById('uploadStatus');

    const updateUploadButtonState = () => {
      const hasFile = aIn?.files?.[0] || pIn?.files?.[0] || photoIn?.files?.[0];
      if (hasFile) {
        uploadBtn.disabled = false;
        uploadBtn.style.opacity = '1';
      } else {
        uploadBtn.disabled = true;
        uploadBtn.style.opacity = '0.6';
      }
    };

    aIn?.addEventListener('change', updateUploadButtonState);
    pIn?.addEventListener('change', updateUploadButtonState);
    photoIn?.addEventListener('change', updateUploadButtonState);

    if (uploadBtn) uploadBtn.addEventListener('click', async () => {
      const aFile = aIn?.files?.[0];
      const pFile = pIn?.files?.[0];
      const photoFile = photoIn?.files?.[0];

      if (!aFile && !pFile && !photoFile) {
        return alert('Please select at least one file to upload');
      }

      if (!assistant || !assistant._id) {
        return alert('No assistant loaded. Please register first.');
      }

      // Validate file sizes (5MB max)
      const maxSize = 5 * 1024 * 1024;
      for (const f of [aFile, pFile, photoFile].filter(Boolean)) {
        if (f.size > maxSize) {
          return alert(`File "${f.name}" is too large. Maximum size is 5MB.`);
        }
      }

      uploadBtn.disabled = true;
      uploadBtn.textContent = 'Uploading...';
      statusDiv.textContent = '';

      try {
        // Use FormData for Multer upload
        const formData = new FormData();
        if (aFile) formData.append('aadhar', aFile);
        if (pFile) formData.append('pan', pFile);
        if (photoFile) formData.append('photo', photoFile);

        const url = `/api/assistants/${assistant._id}/upload-documents`;
        console.log('[Upload] Posting FormData to:', url);

        const res = await fetch(url, {
          method: 'POST',
          body: formData
          // Note: Don't set Content-Type header - browser sets it with boundary
        });

        const result = await res.json();
        console.log('[Upload] Response:', result);

        if (!res.ok || !result.success) {
          throw new Error(result.message || 'Upload failed');
        }

        // Update assistant with new data
        if (result.assistant) {
          assistant = result.assistant;
        }

        statusDiv.innerHTML = '<span style="color:green">✔ Documents uploaded successfully!</span>';
        
        // Re-render to show updated document links
        setTimeout(() => renderAssistant(), 1000);

      } catch (err) {
        console.error('[Upload] Error:', err);
        statusDiv.innerHTML = '<span style="color:red">✖ ' + (err.message || 'Upload failed') + '</span>';
        alert(err.message || 'Upload failed. Please try again.');
      } finally {
        uploadBtn.textContent = 'Upload Documents';
        uploadBtn.disabled = false;
        uploadBtn.style.opacity = '1';
      }
    });
  }
}

async function showAssistantFeedback() {
  if (!assistant || !assistant._id) return alert('No assistant loaded');
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher(`/api/feedback/assistant/${assistant._id}`);
    const list = await res.json();
    const modal = document.createElement('div'); modal.className = 'card'; modal.style.marginTop='8px';
    let html = '<h3>Feedback</h3>';
    if (!list || !list.length) html += '<div>No feedback yet</div>';
    else {
      list.forEach(f => {
        html += `<div style="border-bottom:1px solid #eee;padding:8px 0"><strong>${f.passengerName||'Passenger'}</strong> — ${new Date(f.createdAt).toLocaleString()}<br>Rating: ${f.rating} / 5<br>${f.comments||''}</div>`;
      });
    }
    html += '<div style="margin-top:8px"><button id="closeFb">Close</button></div>';
    modal.innerHTML = html;
    assistantInfo.appendChild(modal);
    document.getElementById('closeFb').addEventListener('click', () => modal.remove());
  } catch (err) { alert('Could not load feedback: ' + err.message) }
}

function showAssistantEdit() {
  if (!assistant) return alert('No assistant loaded');
  const modalId = 'assistantSelfEditCard';
  let modal = document.getElementById(modalId);
  if (modal) return; // already open
  modal = document.createElement('div'); modal.id = modalId; modal.className = 'card';
  modal.style.marginTop = '8px';
  modal.innerHTML = `
    <h3>Edit Profile</h3>
    <label>Name</label><input id="selfEditName" value="${(assistant.name||'').replace(/"/g,'&quot;')}" />
    <label>Station</label><input id="selfEditStation" value="${(assistant.station||'').replace(/"/g,'&quot;')}" />
    <label>Languages (comma separated)</label><input id="selfEditLangs" value="${(assistant.languages||[]).join(',')}" />
    <div style="margin-top:8px"><button id="saveSelfAssistant" class="btn-primary">Save</button><button id="closeSelfAssistant" class="btn-secondary" style="margin-left:8px">Close</button></div>
  `;
  assistantInfo.appendChild(modal);
  document.getElementById('closeSelfAssistant').addEventListener('click', () => modal.remove());
  document.getElementById('saveSelfAssistant').addEventListener('click', async () => {
    const name = document.getElementById('selfEditName').value.trim();
    const station = document.getElementById('selfEditStation').value.trim();
    const langs = document.getElementById('selfEditLangs').value.split(',').map(s=>s.trim()).filter(Boolean);
    try {
      const fetcher = window.RailCareAuth?.authFetch || fetch;
      const res = await fetcher(`/api/assistants/${assistant._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, station, languages: langs }) });
      const j = await res.json();
      if (j.success) { assistant = j.assistant; renderAssistant(); modal.remove(); alert('Saved'); }
      else alert('Save failed: ' + (j.message||JSON.stringify(j)));
    } catch (err) { alert(err.message) }
  });
}

async function refreshAssistantInfo() {
  if (!assistant) return;
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher(`/api/assistants/${assistant._id}`);
    const data = await res.json();
    if (data.success && data.assistant) {
      assistant = data.assistant;
      // Avoid resetting file inputs while the user is in the middle of choosing documents
      const aSel = document.getElementById('uploadAadhar');
      const pSel = document.getElementById('uploadPan');
      const hasPendingFiles = (aSel && aSel.files && aSel.files.length) || (pSel && pSel.files && pSel.files.length);
      if (!hasPendingFiles) {
        renderAssistant();
      }
    }
  } catch (err) { /* ignore */ }
}

let _pollHandle = null;
function startAssistantPolling() {
  if (_pollHandle) return;
  _pollHandle = setInterval(() => {
    refreshAssistantInfo();
  }, 7000);
}

function stopAssistantPolling() {
  if (_pollHandle) clearInterval(_pollHandle);
  _pollHandle = null;
}

async function loadBookings() {
  if (!assistant) return alert('Register or load assistant first');
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher(`/api/assistants/${assistant._id}/bookings`);
    const list = await res.json();
    bookingsList.innerHTML = '';
    if (!list.length) bookingsList.textContent = 'No bookings';
    list.forEach(b => {
      const el = document.createElement('div');
      el.className = 'card';
      // Determine if this booking is assigned to this assistant
      const isAssigned = b.assistantId && assistant && (b.assistantId.toString() === assistant._id.toString());
      let controls = '';
      // Common status line with badge
      function _getStatusClass(status) {
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
      const statusClassLocal = _getStatusClass(b.status);
      let statusLine = `<div class="status-line">Status: <span class="status-badge ${statusClassLocal}">${b.status}${isAssigned ? ' (Assigned to you)' : ''}</span></div>`;

      if (!isAssigned) {
        // Show Accept for pending bookings at station
        if (b.status === 'Pending') {
          controls = `<button data-id="${b._id}" class="accept">Accept</button>`;
        } else {
          controls = '';
        }
      } else {
        // Assigned to this assistant: show controls based on status
        if (b.status === 'Accepted') {
          // show start OTP input + verify
          controls = `<input placeholder="Enter start OTP" data-id="${b._id}" class="otpInput" />
            <button data-id="${b._id}" class="verifyOtp">Verify OTP</button>
            <button data-id="${b._id}" class="reject">Cancel</button>`;
        } else if (b.status === 'In Progress') {
          // In progress: show mark completed button
          controls = `<button data-id="${b._id}" class="requestComplete">Mark Completed</button>
            <button data-id="${b._id}" class="reject">Cancel</button>`;
        } else if (b.status === 'Completion Pending') {
          // Awaiting passenger to confirm; show assistant input to enter completion OTP provided by passenger
          controls = `<div>Awaiting passenger confirmation. Enter completion OTP provided by passenger:</div>
            <input placeholder="Completion OTP" class="assistantCompletionInput" data-id="${b._id}" />
            <button data-id="${b._id}" class="assistantConfirmCompletion">Confirm Completion</button>`;
        } else if (b.status === 'Completed') {
          controls = `<div><strong>Completed</strong></div>`;
        } else {
          controls = '';
        }
      }

      el.innerHTML = `<div><strong>${b.passengerName}</strong> — ${b.trainName || ''} (${b.coach||''}/${b.seat||''})</div>
        <div>Services: ${b.services?.join(',')||'-'}</div>
        <div>Lang: ${b.language||'-'}</div>
        ${statusLine}
        <div style="margin-top:8px">${controls}</div>`;
      bookingsList.appendChild(el);
    });

    bookingsList.querySelectorAll('.accept').forEach(btn => btn.addEventListener('click', acceptBooking));
    bookingsList.querySelectorAll('.reject').forEach(btn => btn.addEventListener('click', rejectBooking));
    bookingsList.querySelectorAll('.verifyOtp').forEach(btn => btn.addEventListener('click', verifyOtp));
    bookingsList.querySelectorAll('.requestComplete').forEach(btn => btn.addEventListener('click', requestComplete));
    bookingsList.querySelectorAll('.assistantConfirmCompletion').forEach(btn => btn.addEventListener('click', assistantConfirmCompletion));
  } catch (err) { alert(err.message) }
}

// Detail view management
let _detailPoll = null;
let _currentDetailId = null;

async function showBookingDetail(id) {
  stopDetailPolling();
  _currentDetailId = id;
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher(`/api/bookings/${id}`);
    const data = await res.json();
    if (!data.success) return alert('Booking not found');
    renderDetail(data.booking);
    startDetailPolling(id);
  } catch (err) { alert(err.message) }
}

function stopDetailPolling() {
  if (_detailPoll) clearInterval(_detailPoll);
  _detailPoll = null;
  _currentDetailId = null;
}

function startDetailPolling(id) {
  _detailPoll = setInterval(async () => {
    try {
      const res = await fetch(`http://localhost:3000/api/bookings/${id}`);
      const d = await res.json();
      if (d.success && d.booking) {
        // update UI
        renderDetail(d.booking);
        if (d.booking.status === 'Completed') {
          stopDetailPolling();
          alert('Booking completed');
          loadBookings();
        }
      }
    } catch (e) { /* ignore */ }
  }, 3000);
}

function renderDetail(b) {
  bookingsList.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'card';
  const assistantAssigned = b.assistantId && assistant && (b.assistantId.toString() === assistant._id.toString());
  const priceLine = b.price ? `<div>Price: ₹${b.price.toFixed(2)}</div>` : '';
  let controls = '';
  if (!assistantAssigned) {
    controls = `<div>Not assigned to you</div>`;
  } else {
    if (b.status === 'Accepted') {
      controls = `<input placeholder="Enter start OTP" data-id="${b._id}" class="otpInput" />
        <button data-id="${b._id}" class="verifyOtp">Verify OTP</button>`;
    } else if (b.status === 'In Progress') {
      controls = `<button data-id="${b._id}" class="requestComplete">Mark Completed</button>`;
    } else if (b.status === 'Completion Pending') {
      controls = `<div>Awaiting passenger confirmation. Enter completion OTP provided by passenger:</div>
        <input placeholder="Completion OTP" class="assistantCompletionInput" data-id="${b._id}" />
        <button data-id="${b._id}" class="assistantConfirmCompletion">Confirm Completion</button>`;
    } else if (b.status === 'Completed') {
      controls = `<div><strong>Completed</strong></div>`;
    }
  }

  // build status badge for detail view
  const sb = (function(s){
    if (!s) return `<span class="status-badge">-</span>`;
    const ss = s.toLowerCase();
    if (ss.includes('pending') && ss.includes('completion')) return `<span class="status-badge status-completion-pending blink">${s}</span>`;
    if (ss === 'pending') return `<span class="status-badge status-pending blink">${s}</span>`;
    if (ss === 'accepted') return `<span class="status-badge status-accepted">${s}</span>`;
    if (ss === 'in progress' || ss === 'inprogress') return `<span class="status-badge status-inprogress blink">${s}</span>`;
    if (ss === 'completed') return `<span class="status-badge status-completed">${s}</span>`;
    if (ss === 'rejected') return `<span class="status-badge status-rejected">${s}</span>`;
    return `<span class="status-badge">${s}</span>`;
  })(b.status);

  el.innerHTML = `<div><h3>Booking — ${b.passengerName}</h3>
    <div>Station: ${b.station}</div>
    <div>Train: ${b.trainName||'-'}</div>
    <div>Coach/Seat: ${b.coach||''}/${b.seat||''}</div>
    <div>Services: ${b.services?.join(',')||'-'}</div>
    ${priceLine}
    <div class="status-line">Status: ${sb}</div>
    <div style="margin-top:8px">${controls}</div>
    <div style="margin-top:12px"><button id="backToList">Back to list</button></div>
    </div>`;
  bookingsList.appendChild(el);

  // attach handlers
  const back = document.getElementById('backToList');
  if (back) back.addEventListener('click', () => { stopDetailPolling(); loadBookings(); });
  el.querySelectorAll('.verifyOtp').forEach(btn => btn.addEventListener('click', async (e) => {
    const id = e.target.dataset.id;
    const input = document.querySelector(`.otpInput[data-id="${id}"]`);
    const otp = input?.value?.trim();
    if (!otp) return alert('Enter OTP');
    try {
      const fetcher = window.RailCareAuth?.authFetch || fetch;
      const res = await fetcher(`/api/bookings/${id}/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp }) });
      const data = await res.json();
      if (data.success) { alert('OTP verified. Status set to In Progress'); showBookingDetail(id); }
      else alert('Invalid OTP');
    } catch (err) { alert(err.message) }
  }));
  el.querySelectorAll('.requestComplete').forEach(btn => btn.addEventListener('click', async (e) => {
    const id = e.target.dataset.id;
    try {
      const fetcher = window.RailCareAuth?.authFetch || fetch;
      const res = await fetcher(`/api/bookings/${id}/complete-request`, { method: 'POST' });
      const data = await res.json();
      if (data.success) { alert('Completion requested. Ask passenger for completion OTP.'); showBookingDetail(id); }
      else alert('Request failed');
    } catch (err) { alert(err.message) }
  }));
  el.querySelectorAll('.assistantConfirmCompletion').forEach(btn => btn.addEventListener('click', async (e) => {
    const id = e.target.dataset.id;
    const input = document.querySelector(`.assistantCompletionInput[data-id="${id}"]`);
    const otp = input?.value?.trim();
    if (!otp) return alert('Enter completion OTP provided by passenger');
    try {
      const fetcher = window.RailCareAuth?.authFetch || fetch;
      const res = await fetcher(`/api/bookings/${id}/confirm-completion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp }) });
      const data = await res.json();
      if (data.success) { alert('Booking marked Completed'); stopDetailPolling(); loadBookings(); }
      else alert('Invalid OTP or error: ' + (data.message||JSON.stringify(data)));
    } catch (err) { alert(err.message) }
  }));
}

async function acceptBooking(e) {
  const id = e.target.dataset.id;
  if (!assistant) return alert('Load assistant first');
  if (!assistant.verified) return alert('Your account is not verified by admin yet.');
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher(`/api/bookings/${id}/accept`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assistantId: assistant._id })
    });
    const data = await res.json();
    if (data.success) { alert('Accepted'); loadBookings(); }
    else alert('Accept failed: ' + (data.message||JSON.stringify(data)));
  } catch (err) { alert(err.message) }
}

async function rejectBooking(e) {
  const id = e.target.dataset.id;
  try {
    // If this assistant is currently assigned to the booking, include assistantId so backend reopens booking
    const body = {};
    // bailsafe: attempt to read assistant id from local assistant object
    if (assistant && assistant._id) body.assistantId = assistant._id;
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher(`/api/bookings/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.success) { alert('Rejected'); loadBookings(); }
    else alert('Reject failed');
  } catch (err) { alert(err.message) }
}

async function verifyOtp(e) {
  const id = e.target.dataset.id;
  const input = document.querySelector(`.otpInput[data-id="${id}"]`);
  const otp = input.value.trim();
  if (!otp) return alert('Enter OTP');
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher(`/api/bookings/${id}/verify-otp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp, assistantId: assistant?._id })
    });
    const data = await res.json();
    if (data.success) { alert('OTP verified. Status set to In Progress'); loadBookings(); }
    else alert('OTP invalid');
  } catch (err) { alert(err.message) }
}

async function requestComplete(e) {
  const id = e.target.dataset.id;
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher(`/api/bookings/${id}/complete-request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assistantId: assistant?._id }) });
    const data = await res.json();
    if (data.success) {
      alert('Completion requested. Wait for passenger to provide the completion OTP.');
      loadBookings();
    } else alert('Request failed');
  } catch (err) { alert(err.message) }
}

async function assistantConfirmCompletion(e) {
  const id = e.target.dataset.id;
  const input = document.querySelector(`.assistantCompletionInput[data-id="${id}"]`);
  const otp = input?.value?.trim();
  if (!otp) return alert('Enter completion OTP provided by passenger');
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher(`/api/bookings/${id}/confirm-completion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp, assistantId: assistant?._id })
    });
    const data = await res.json();
    if (data.success) { alert('Booking marked Completed'); loadBookings(); }
    else alert('Invalid OTP or error: ' + (data.message||JSON.stringify(data)));
  } catch (err) { alert(err.message) }
}
