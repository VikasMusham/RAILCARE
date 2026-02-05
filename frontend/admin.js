// admin.js - list assistants and bookings, approve/reject assistants
// enforce admin-only access
window.RailCareAuth?.enforceRole && window.RailCareAuth.enforceRole('admin');
const assistantsList = document.getElementById('assistantsList');
const applicationsList = document.getElementById('applicationsList');
const allBookings = document.getElementById('allBookings');
const refreshAssistants = document.getElementById('refreshAssistants');
const refreshBookings = document.getElementById('refreshBookings');
const adminOverview = document.createElement('div');
adminOverview.id = 'adminOverview';
// insert admin overview after the header so it doesn't appear above the brand
const headerEl = document.querySelector('header.site-header');
if (headerEl && headerEl.parentNode) headerEl.parentNode.insertBefore(adminOverview, headerEl.nextSibling);
else {
  const parentCard = document.querySelector('body');
  if (parentCard) parentCard.insertBefore(adminOverview, document.body.firstChild);
}

// Tab switching
document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab)?.classList.add('active');
    
    // Load data for the tab
    if (tab.dataset.tab === 'applications') loadApplications();
    else if (tab.dataset.tab === 'assistants') loadAssistants();
    else if (tab.dataset.tab === 'bookings') loadBookings();
    else if (tab.dataset.tab === 'audit') loadAuditLogs();
  });
});

refreshAssistants?.addEventListener('click', loadAssistants);
refreshBookings?.addEventListener('click', loadBookings);
document.getElementById('refreshAudit')?.addEventListener('click', loadAuditLogs);
document.getElementById('refreshApps')?.addEventListener('click', loadApplications);
document.getElementById('appStatusFilter')?.addEventListener('change', loadApplications);

// Load applications on page load
loadApplications();

// ============================================
// APPLICATIONS MANAGEMENT
// ============================================

async function loadApplications() {
  if (!applicationsList) return;
  
  try {
    const status = document.getElementById('appStatusFilter')?.value || '';
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher(`/api/admin/applications${status ? '?status=' + status : ''}`);
    const data = await res.json();
    
    if (!data.success) {
      applicationsList.innerHTML = '<div style="color:#dc3545">Error loading applications</div>';
      return;
    }

    const apps = data.applications || [];
    
    // Update badge
    const pendingCount = apps.filter(a => a.applicationStatus === 'Pending').length;
    const badge = document.getElementById('pendingAppsBadge');
    if (badge) {
      badge.textContent = pendingCount;
      badge.style.display = pendingCount > 0 ? 'inline' : 'none';
    }

    if (apps.length === 0) {
      applicationsList.innerHTML = '<div style="text-align:center;padding:40px;color:#666">No applications found</div>';
      return;
    }

    applicationsList.innerHTML = apps.map(app => {
      const statusClass = app.applicationStatus === 'Approved' ? 'status-approved' : 
                         app.applicationStatus === 'Rejected' ? 'status-rejected' : 'status-pending';
      
      const photoHtml = app.photoFilePath ? 
        `<img src="${app.photoFilePath}" class="photo-thumb" alt="Photo" />` : 
        '<div style="width:60px;height:60px;border-radius:50%;background:#e9ecef;display:flex;align-items:center;justify-content:center">👤</div>';

      let actionsHtml = '';
      if (app.applicationStatus === 'Pending') {
        actionsHtml = `
          <button class="btn-approve" onclick="approveApplication('${app._id}')">✅ Approve</button>
          <button class="btn-reject" onclick="rejectApplication('${app._id}')">❌ Reject</button>
        `;
      } else if (app.applicationStatus === 'Approved') {
        actionsHtml = '<span style="color:#28a745;font-weight:600">✅ Approved on ${app.approvalDate ? new Date(app.approvalDate).toLocaleDateString() : "N/A"}</span>';
      } else if (app.applicationStatus === 'Rejected') {
        actionsHtml = `
          <span style="color:#dc3545">Reason: ${app.rejectionReason || 'Not specified'}</span>
          <button class="btn-approve" onclick="approveApplication('${app._id}')" style="margin-left:12px">✅ Approve Now</button>
        `;
      }

      return `
        <div class="app-card">
          <div class="app-header">
            <div style="display:flex;align-items:center;gap:12px">
              ${photoHtml}
              <div>
                <div class="app-name">${app.name || 'Unknown'}</div>
                <div style="color:#666;font-size:13px">${app.station || 'No station'}</div>
              </div>
            </div>
            <span class="app-status ${statusClass}">${app.applicationStatus}</span>
          </div>
          <div class="app-details">
            <div class="app-detail">
              <div class="app-detail-label">Phone</div>
              <div>${app.phone || '-'}</div>
            </div>
            <div class="app-detail">
              <div class="app-detail-label">Age</div>
              <div>${app.age || '-'}</div>
            </div>
            <div class="app-detail">
              <div class="app-detail-label">Experience</div>
              <div>${app.yearsOfExperience || 0} years</div>
            </div>
            <div class="app-detail">
              <div class="app-detail-label">Languages</div>
              <div>${app.languages?.join(', ') || '-'}</div>
            </div>
            <div class="app-detail">
              <div class="app-detail-label">Applied On</div>
              <div>${app.applicationDate ? new Date(app.applicationDate).toLocaleDateString() : '-'}</div>
            </div>
          </div>
          <div class="app-detail" style="margin-bottom:12px">
            <div class="app-detail-label">Address</div>
            <div>${app.permanentAddress || '-'}</div>
          </div>
          <div class="app-docs">
            ${app.aadharFilePath ? `<a href="${app.aadharFilePath}" target="_blank" class="app-doc-link">🪪 View Aadhaar</a>` : '<span style="color:#999">No Aadhaar</span>'}
            ${app.panFilePath ? `<a href="${app.panFilePath}" target="_blank" class="app-doc-link">💳 View PAN</a>` : '<span style="color:#999">No PAN</span>'}
            ${app.photoFilePath ? `<a href="${app.photoFilePath}" target="_blank" class="app-doc-link">📷 View Photo</a>` : ''}
          </div>
          <div class="app-actions">
            ${actionsHtml}
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Load applications error:', err);
    applicationsList.innerHTML = '<div style="color:#dc3545">Error: ' + err.message + '</div>';
  }
}

async function approveApplication(id) {
  if (!confirm('Are you sure you want to approve this application?')) return;
  
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher(`/api/admin/applications/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    
    if (data.success) {
      alert('✅ Application approved successfully!');
      loadApplications();
    } else {
      alert('Error: ' + (data.message || 'Failed to approve'));
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function rejectApplication(id) {
  const reason = prompt('Enter rejection reason:', 'Your application has been rejected. Please ensure all documents are clear and valid.');
  if (!reason) return;
  
  const allowReapply = confirm('Allow applicant to reapply with updated documents?');
  
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher(`/api/admin/applications/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, allowReapply })
    });
    const data = await res.json();
    
    if (data.success) {
      alert('❌ Application rejected');
      loadApplications();
    } else {
      alert('Error: ' + (data.message || 'Failed to reject'));
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// Make functions available globally
window.approveApplication = approveApplication;
window.rejectApplication = rejectApplication;

// ============================================
// ASSISTANTS MANAGEMENT (existing code)
// ============================================

async function loadAssistants() {
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher('/api/assistants');
    const list = await res.json();
    assistantsList.innerHTML = '';
    if (!list || !list.length) { assistantsList.textContent = 'No assistants yet'; return; }
    
    // dedupe by _id to avoid duplicate entries
    const seenA = new Map();
    list.forEach(a => { if (a && a._id && !seenA.has(a._id)) seenA.set(a._id, a); });
    
    // Filter to show only approved assistants in this tab
    const approvedAssistants = Array.from(seenA.values()).filter(a => a.applicationStatus === 'Approved' || a.verified);
    
    if (approvedAssistants.length === 0) {
      assistantsList.textContent = 'No verified assistants yet';
      return;
    }
    
    approvedAssistants.forEach(a => {
      const el = document.createElement('div');
      el.className = 'card';
      el.style.marginBottom = '12px';
      
      // Get document URLs (support both Multer paths and legacy)
      const aadharUrl = a.aadharFilePath || a.documents?.aadhar || null;
      const panUrl = a.panFilePath || a.documents?.pan || null;
      const photoUrl = a.photoFilePath || null;
      
      // Document status badge
      let docStatusHtml = '';
      if (a.documentsVerified) {
        docStatusHtml = `<span style="background:#28a745;color:white;padding:2px 8px;border-radius:4px;font-size:12px">✔ Verified</span>`;
      } else if (a.documentsRemark && a.documentsRemark.toLowerCase().includes('hold')) {
        docStatusHtml = `<span style="background:#ffc107;color:#333;padding:2px 8px;border-radius:4px;font-size:12px">⏸ On Hold</span>`;
      } else if (a.documentsRemark && (a.documentsRemark.toLowerCase().includes('reject') || a.documentsRemark.toLowerCase().includes('cancel'))) {
        docStatusHtml = `<span style="background:#dc3545;color:white;padding:2px 8px;border-radius:4px;font-size:12px">✖ Rejected</span>`;
      } else if (aadharUrl || panUrl) {
        docStatusHtml = `<span style="background:#17a2b8;color:white;padding:2px 8px;border-radius:4px;font-size:12px">⏳ Pending Review</span>`;
      } else {
        docStatusHtml = `<span style="background:#6c757d;color:white;padding:2px 8px;border-radius:4px;font-size:12px">No Documents</span>`;
      }
      
      // Document links with preview buttons
      let docsHtml = '<div style="margin:8px 0;padding:8px;background:#f8f9fa;border-radius:4px">';
      docsHtml += '<strong>📄 Documents:</strong> ' + docStatusHtml + '<br><br>';
      
      if (aadharUrl) {
        docsHtml += `<div style="margin-bottom:6px">Aadhaar: <a href="${aadharUrl}" target="_blank">View</a> <button class="previewDoc btn-secondary" data-url="${aadharUrl}" style="padding:2px 8px;font-size:12px">Preview</button></div>`;
      } else {
        docsHtml += '<div style="margin-bottom:6px;color:#888">Aadhaar: Not uploaded</div>';
      }
      
      if (panUrl) {
        docsHtml += `<div style="margin-bottom:6px">PAN: <a href="${panUrl}" target="_blank">View</a> <button class="previewDoc btn-secondary" data-url="${panUrl}" style="padding:2px 8px;font-size:12px">Preview</button></div>`;
      } else {
        docsHtml += '<div style="margin-bottom:6px;color:#888">PAN: Not uploaded</div>';
      }
      
      if (photoUrl) {
        docsHtml += `<div style="margin-bottom:6px">Photo: <a href="${photoUrl}" target="_blank">View</a> <button class="previewDoc btn-secondary" data-url="${photoUrl}" style="padding:2px 8px;font-size:12px">Preview</button></div>`;
      }
      
      // Show remark if exists
      if (a.documentsRemark) {
        docsHtml += `<div style="margin-top:8px;padding:6px;background:#fff3cd;border-radius:4px;font-size:13px"><strong>Remark:</strong> ${a.documentsRemark}</div>`;
      }
      
      // Document action buttons (only if documents exist and not yet verified)
      if ((aadharUrl || panUrl) && !a.documentsVerified) {
        docsHtml += `<div style="margin-top:10px">
          <button class="verifyDocsBtn btn-primary" data-id="${a._id}" style="background:#28a745;margin-right:4px">✔ Verify</button>
          <button class="holdDocsBtn btn-secondary" data-id="${a._id}" style="background:#ffc107;color:#333;margin-right:4px">⏸ Hold</button>
          <button class="rejectDocsBtn btn-secondary" data-id="${a._id}" style="background:#dc3545;color:white">✖ Reject</button>
        </div>`;
      }
      docsHtml += '</div>';
      
      // Assistant verification status
      const ratingText = a.rating ? `Rating: ${a.rating.toFixed(1)} / 5 (${a.ratingCount||0})` : 'No ratings yet';
      
      let actionHtml = '';
      if (a.verified) {
        actionHtml = `<span style="background:#28a745;color:white;padding:4px 12px;border-radius:4px;margin-right:8px">✔ Approved</span>
                      <button data-id="${a._id}" class="edit btn-secondary">Edit</button>`;
      } else {
        actionHtml = `<button data-id="${a._id}" class="approve btn-primary" style="background:#28a745;margin-right:4px">Approve</button>
                      <button data-id="${a._id}" class="reject btn-secondary" style="background:#dc3545;color:white">Reject</button>`;
      }
      
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><strong style="font-size:16px">${a.name}</strong> — ${a.station}</div>
          <div>${a.verified ? '<span style="color:#28a745">✔ Verified</span>' : '<span style="color:#ffc107">⏳ Pending</span>'}</div>
        </div>
        <div style="margin-top:4px;color:#666">Languages: ${a.languages?.join(', ')||'Not specified'}</div>
        <div style="margin-top:4px;color:#666">${ratingText}</div>
        ${docsHtml}
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid #eee">${actionHtml}</div>`;
      
      assistantsList.appendChild(el);
    });
    
    // Attach preview handlers
    assistantsList.querySelectorAll('.previewDoc').forEach(btn => btn.addEventListener('click', (e) => {
      const url = e.target.dataset.url;
      if (!url) return;
      showDocumentPreview(url);
    }));
    
    // Verify docs handlers
    assistantsList.querySelectorAll('.verifyDocsBtn').forEach(b => b.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      const remark = prompt('Add verification remark (optional):', '') || '';
      try {
        const fetcher = window.RailCareAuth?.authFetch || fetch;
        const res = await fetcher(`/api/assistants/${id}/verify-docs`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ remark: remark || 'Documents verified by admin' }) 
        });
        const j = await res.json();
        if (j.success) { alert('✔ Documents verified successfully'); loadAssistants(); }
        else alert('Failed: ' + (j.message||JSON.stringify(j)));
      } catch (err) { alert(err.message) }
    }));
    
    // Hold docs handlers
    assistantsList.querySelectorAll('.holdDocsBtn').forEach(b => b.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      const remark = prompt('Reason for putting on hold:', 'Documents on hold - needs clarification');
      if (!remark) return;
      try {
        const fetcher = window.RailCareAuth?.authFetch || fetch;
        const res = await fetcher(`/api/assistants/${id}/reject-docs`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ remark: 'HOLD: ' + remark }) 
        });
        const j = await res.json();
        if (j.success) { alert('⏸ Documents put on hold'); loadAssistants(); }
        else alert('Failed: ' + (j.message||JSON.stringify(j)));
      } catch (err) { alert(err.message) }
    }));
    
    // Reject docs handlers
    assistantsList.querySelectorAll('.rejectDocsBtn').forEach(b => b.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      const remark = prompt('Reason for rejection:', 'Documents rejected - invalid or unclear');
      if (!remark) return;
      if (!confirm('Are you sure you want to reject these documents?')) return;
      try {
        const fetcher = window.RailCareAuth?.authFetch || fetch;
        const res = await fetcher(`/api/assistants/${id}/reject-docs`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ remark: 'REJECTED: ' + remark }) 
        });
        const j = await res.json();
        if (j.success) { alert('✖ Documents rejected'); loadAssistants(); }
        else alert('Failed: ' + (j.message||JSON.stringify(j)));
      } catch (err) { alert(err.message) }
    }));
    
    assistantsList.querySelectorAll('.approve').forEach(b=>b.addEventListener('click', approve));
    assistantsList.querySelectorAll('.reject').forEach(b=>b.addEventListener('click', reject));
    assistantsList.querySelectorAll('.edit').forEach(b=>b.addEventListener('click', (e)=> showEditAssistantUI(e.target.dataset.id)));
  } catch (err) { alert(err.message) }
}

// Document preview modal
function showDocumentPreview(url) {
  // Remove existing modal if any
  const existing = document.getElementById('docPreviewModal');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.id = 'docPreviewModal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999';
  
  const ext = url.split('.').pop().toLowerCase();
  let content = '';
  if (ext === 'pdf') {
    content = `<iframe src="${url}" style="width:80vw;height:80vh;border:0;background:white"></iframe>`;
  } else {
    content = `<img src="${url}" style="max-width:90vw;max-height:90vh;border-radius:8px" />`;
  }
  
  modal.innerHTML = `
    <div style="position:relative">
      ${content}
      <button id="closeDocPreview" style="position:absolute;top:-40px;right:0;background:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-weight:bold">✕ Close</button>
    </div>`;
  
  document.body.appendChild(modal);
  document.getElementById('closeDocPreview').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

async function approve(e) {
  const id = e.target.dataset.id;
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher(`/api/assistants/${id}/approve`, { method: 'POST' });
    const data = await res.json();
    if (data.success) { alert('Approved'); loadAssistants(); }
    else alert('Approve failed');
  } catch (err) { alert(err.message) }
}

async function reject(e) {
  const id = e.target.dataset.id;
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher(`/api/assistants/${id}/reject`, { method: 'POST' });
    const data = await res.json();
    if (data.success) { alert('Rejected'); loadAssistants(); }
    else alert('Reject failed');
  } catch (err) { alert(err.message) }
}

let _currentBookings = [];

async function loadBookings() {
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const station = document.getElementById('filterStation')?.value || '';
    const status = document.getElementById('filterStatus')?.value || '';
    const passenger = document.getElementById('filterPassenger')?.value || '';
    const qs = [];
    if (station) qs.push('station=' + encodeURIComponent(station));
    if (status) qs.push('status=' + encodeURIComponent(status));
    if (passenger) qs.push('passengerName=' + encodeURIComponent(passenger));
    const url = '/api/bookings' + (qs.length ? ('?' + qs.join('&')) : '');
    const res = await fetcher(url);
    const list = await res.json();
    // dedupe bookings by _id (server may sometimes return duplicates)
    const seen = new Map();
    (Array.isArray(list) ? list : []).forEach(b => { if (b && b._id && !seen.has(b._id)) seen.set(b._id, b); });
    _currentBookings = Array.from(seen.values());
    allBookings.innerHTML = '';
    if (!_currentBookings.length) { allBookings.textContent = 'No bookings found'; return; }
    _currentBookings.forEach(b=>{
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = `<div><strong>${b.passengerName}</strong> — ${b.station} — ${b.status}</div>
        <div>Train: ${b.trainName||'-'} Coach/Seat: ${b.coach||''}/${b.seat||''}</div>
        <div>Services: ${b.services?.join(',')||'-'}</div>`;
      const assignWrap = document.createElement('div');
      assignWrap.style.marginTop = '8px';
      // Edit button always available
      const editBtn = document.createElement('button'); editBtn.textContent = 'Edit'; editBtn.style.marginLeft='8px'; editBtn.addEventListener('click', () => showEditBookingUI(b));
      assignWrap.appendChild(editBtn);

      // For non-completed bookings allow assign/cancel actions
      const statusLower = (b.status||'').toLowerCase();
      if (statusLower !== 'completed') {
        // show Assign only when booking is pending and not already assigned
        if ((!b.assistantId || b.assistantId === null) && statusLower === 'pending') {
          const assignBtn = document.createElement('button');
          assignBtn.textContent = 'Assign Assistant';
          assignBtn.style.marginLeft = '8px';
          assignBtn.addEventListener('click', () => showAssignUI(b, el, assignWrap));
          assignWrap.appendChild(assignBtn);
        }
        // show Cancel for any non-completed bookings
        const cancelBtn = document.createElement('button'); cancelBtn.textContent = 'Cancel Booking'; cancelBtn.style.marginLeft='8px'; cancelBtn.addEventListener('click', () => cancelBooking(b));
        assignWrap.appendChild(cancelBtn);
      }
      el.appendChild(assignWrap);
      allBookings.appendChild(el);
    });
  } catch (err) { alert(err.message) }
}

async function cancelBooking(booking) {
  if (!confirm('Cancel this booking? This will mark it as Rejected.')) return;
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher(`/api/bookings/${booking._id}/cancel`, { method: 'POST' });
    const j = await res.json();
    if (j.success) { alert('Booking cancelled'); loadBookings(); }
    else alert('Cancel failed: ' + (j.message||JSON.stringify(j)));
  } catch (err) { alert(err.message) }
}

async function showEditBookingUI(booking) {
  // create modal-like edit card
  try {
    const modal = document.createElement('div'); modal.className='card'; modal.id='bookingEditCard';
    modal.style.marginBottom='12px';
    modal.innerHTML = `
      <h3>Edit Booking</h3>
      <label>Passenger Name</label><input id="editBName" value="${(booking.passengerName||'').replace(/"/g,'&quot;')}" />
      <label>Station</label><input id="editBStation" value="${(booking.station||'').replace(/"/g,'&quot;')}" />
      <label>Train</label><input id="editBTrain" value="${(booking.trainName||'').replace(/"/g,'&quot;')}" />
      <div class="field-row"><div><label>Coach</label><input id="editBCoach" value="${(booking.coach||'').replace(/"/g,'&quot;')}" /></div><div><label>Seat</label><input id="editBSeat" value="${(booking.seat||'').replace(/"/g,'&quot;')}" /></div></div>
      <label>Services (comma separated)</label><input id="editBServices" value="${(booking.services||[]).join(',')}" />
      <label>Language</label><input id="editBLang" value="${(booking.language||'')}" />
      <label>Price</label><input id="editBPrice" value="${booking.price||''}" />
      <div style="margin-top:8px"><button id="saveBookingBtn">Save</button><button id="closeBookingBtn" style="margin-left:8px">Close</button></div>
    `;
    // insert modal at top of bookings list
    const existing = document.getElementById('bookingEditCard'); if (existing) existing.remove();
    const container = document.getElementById('allBookings');
    container.insertBefore(modal, container.firstChild);
    document.getElementById('closeBookingBtn').addEventListener('click', () => modal.remove());
    document.getElementById('saveBookingBtn').addEventListener('click', async () => {
      const payload = {
        passengerName: document.getElementById('editBName').value.trim(),
        station: document.getElementById('editBStation').value.trim(),
        trainName: document.getElementById('editBTrain').value.trim(),
        coach: document.getElementById('editBCoach').value.trim(),
        seat: document.getElementById('editBSeat').value.trim(),
        services: document.getElementById('editBServices').value.split(',').map(s=>s.trim()).filter(Boolean),
        language: document.getElementById('editBLang').value.trim(),
        price: parseFloat(document.getElementById('editBPrice').value) || 0
      };
      try {
        const fetcher = window.RailCareAuth?.authFetch || fetch;
        const res = await fetcher(`/api/bookings/${booking._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const j = await res.json();
        if (j.success) { alert('Saved'); modal.remove(); loadBookings(); }
        else alert('Save failed: ' + (j.message||JSON.stringify(j)));
      } catch (err) { alert(err.message) }
    });
  } catch (err) { alert(err.message) }
}

function exportCsv() {
  if (!_currentBookings || !_currentBookings.length) return alert('No bookings to export');
  const rows = [];
  const header = ['id','passengerName','phone','station','trainName','coach','seat','services','status','assistantId','price','createdAt'];
  rows.push(header.join(','));
  _currentBookings.forEach(b => {
    const line = [
      b._id || '',
      `"${(b.passengerName||'').replace(/"/g,'""')}"`,
      `"${(b.phone||'').replace(/"/g,'""')}"`,
      `"${(b.station||'').replace(/"/g,'""')}"`,
      `"${(b.trainName||'').replace(/"/g,'""')}"`,
      `"${(b.coach||'').replace(/"/g,'""')}"`,
      `"${(b.seat||'').replace(/"/g,'""')}"`,
      `"${(b.services||[]).join(';').replace(/"/g,'""')}"`,
      b.status || '',
      b.assistantId || '',
      b.price || '',
      b.createdAt || ''
    ];
    rows.push(line.join(','));
  });
  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bookings-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// initial load
loadAssistants();
// start polling so admin sees updates when assistants upload docs
let _assistantPoll = null;
function startAssistantPolling() {
  if (_assistantPoll) return;
  _assistantPoll = setInterval(() => {
    loadAssistants();
  }, 5000);
}
function stopAssistantPolling() {
  if (_assistantPoll) clearInterval(_assistantPoll);
  _assistantPoll = null;
}
startAssistantPolling();
loadBookings();
document.getElementById('filterStation')?.addEventListener('change', loadBookings);
document.getElementById('filterStatus')?.addEventListener('change', loadBookings);
document.getElementById('filterPassenger')?.addEventListener('keyup', () => { clearTimeout(window._adminFilterTimer); window._adminFilterTimer = setTimeout(loadBookings, 400); });
document.getElementById('exportCsv')?.addEventListener('click', exportCsv);
document.getElementById('exportFeedbackCsv')?.addEventListener('click', exportFeedbackCsv);

async function exportFeedbackCsv() {
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher('/api/feedback');
    if (!res.ok) return alert('Failed to fetch feedbacks');
    const list = await res.json();
    if (!list || !list.length) return alert('No feedback to export');
    const rows = [];
    const header = ['id','bookingId','assistantId','assistantName','passengerId','passengerName','rating','comments','createdAt'];
    rows.push(header.join(','));
    list.forEach(f => {
      const line = [
        f._id || '',
        f.bookingId || '',
        f.assistantId || '',
        `"${(f.assistantName||'').replace(/"/g,'""')}"`,
        f.passengerId || '',
        `"${(f.passengerName||'').replace(/"/g,'""')}"`,
        f.rating || '',
        `"${(f.comments||'').replace(/"/g,'""')}"`,
        f.createdAt || ''
      ];
      rows.push(line.join(','));
    });
    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `feedback-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch (err) { alert('Export failed: ' + err.message) }
}
document.getElementById('clearData')?.addEventListener('click', async () => {
  if (!confirm('Clear all demo data? This will delete bookings, assistants and non-admin users.')) return;
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher('/api/admin/clear', { method: 'POST' });
    const j = await res.json();
    if (j.success) { alert('Demo data cleared'); loadBookings(); loadAssistants(); loadOverview && loadOverview(); }
    else alert('Clear failed: ' + (j.message||JSON.stringify(j)));
  } catch (err) { alert(err.message) }
});
// loadOverview will be called when admin page is ready
setTimeout(() => loadOverview && loadOverview(), 300);

async function loadOverview() {
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher('/api/admin/overview');
    const data = await res.json();
    const container = document.getElementById('adminOverview');
    if (!container) return;
    if (!data.success) return container.textContent = 'Overview not available: ' + (data.message||data.error||'');
    const o = data.overview;
    // clear previous content to avoid duplicate cards
    container.innerHTML = '';
    container.innerHTML = `<div class="card"><strong>Totals</strong>
      <div>Total bookings: ${o.total}</div>
      <div>Pending: ${o.pending} — Accepted: ${o.accepted} — In Progress: ${o.inProgress}</div>
      <div>Completed: ${o.completed} — Rejected: ${o.rejected}</div>
    </div>`;
    // stations
    const bs = document.createElement('div'); bs.className='card'; bs.innerHTML = '<strong>By Station</strong>';
    o.byStation.forEach(s=>{ const d=document.createElement('div'); d.textContent = `${s._id}: ${s.count}`; bs.appendChild(d); });
    container.appendChild(bs);
    const as = document.createElement('div'); as.className='card'; as.innerHTML = '<strong>Assistant Stats</strong>';
    o.assistantStats.forEach(s=>{ const d=document.createElement('div'); d.textContent = `${s._id}: total ${s.total}, verified ${s.verified}`; as.appendChild(d); });
    container.appendChild(as);
  } catch (err) { /* ignore */ }
}

async function loadAuditLogs() {
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher('/api/admin/audit');
    const j = await res.json();
    const container = document.getElementById('auditLogs');
    if (!container) return;
    if (!j.success) return container.textContent = 'Audit not available';
    container.innerHTML = '';
    j.logs.forEach(l => {
      const el = document.createElement('div'); el.className='card';
      el.innerHTML = `<div><strong>${l.action}</strong> — ${l.targetType} ${l.targetId}</div><div>By: ${l.actorRole||''} ${l.actorId||''} — ${new Date(l.createdAt).toLocaleString()}</div><div>${JSON.stringify(l.meta||{})}</div>`;
      container.appendChild(el);
    });
  } catch (err) { alert('Failed to load audit: ' + err.message) }
}

async function showAssignUI(booking, cardEl, containerEl) {
  // clear previous UI
  containerEl.innerHTML = '';
  const info = document.createElement('div');
  info.textContent = 'Loading assistants...';
  containerEl.appendChild(info);
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const r = await fetcher('/api/assistants');
    const assistants = await r.json();
    // filter assistants for same station and verified
    const candidates = assistants.filter(a => a.station === booking.station && a.verified);
    containerEl.innerHTML = '';
    if (!candidates.length) {
      containerEl.textContent = 'No verified assistants available for this station';
      return;
    }
    const sel = document.createElement('select');
    candidates.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a._id;
      opt.textContent = `${a.name} (${a.languages?.join(',')||'-'})`;
      sel.appendChild(opt);
    });
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Confirm Assign';
    confirmBtn.style.marginLeft = '8px';
    confirmBtn.addEventListener('click', async () => {
      const assistantId = sel.value;
      try {
        const fetcher2 = window.RailCareAuth?.authFetch || fetch;
        const res = await fetcher2(`/api/bookings/${booking._id}/assign`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assistantId })
        });
        const data = await res.json();
        if (data.success) {
          alert('Assigned');
          loadBookings();
          loadAssistants();
        } else alert('Assign failed: ' + (data.message||JSON.stringify(data)));
      } catch (err) { alert(err.message) }
    });
    containerEl.appendChild(sel);
    containerEl.appendChild(confirmBtn);
  } catch (err) {
    containerEl.innerHTML = 'Failed to load assistants';
  }
}

async function showEditAssistantUI(assistantId) {
  // open a simple prompt-style edit UI
  try {
    const fetcher = window.RailCareAuth?.authFetch || fetch;
    const res = await fetcher(`/api/assistants/${assistantId}`);
    const data = await res.json();
    if (!data.success) return alert('Assistant not found');
    const a = data.assistant;
    // create modal-like card at top of assistants list
    const modal = document.createElement('div');
    modal.className = 'card';
    modal.id = 'assistantEditCard';
    modal.innerHTML = `
      <h3>Edit Assistant</h3>
      <label>Name</label>
      <input id="editName" value="${(a.name||'').replace(/"/g,'&quot;')}" />
      <label>Station</label>
      <input id="editStation" value="${(a.station||'').replace(/"/g,'&quot;')}" />
      <label>Languages (comma separated)</label>
      <input id="editLangs" value="${(a.languages||[]).join(',')}" />
      <div style="margin-top:8px">
        <button id="saveAssistantBtn">Save</button>
        <button id="revokeAssistantBtn" style="margin-left:8px">Revoke (Unverify)</button>
        <button id="closeEditBtn" style="margin-left:8px">Close</button>
      </div>
    `;
    // remove any existing edit card
    const existing = document.getElementById('assistantEditCard'); if (existing) existing.remove();
    const container = document.getElementById('assistantsList');
    container.insertBefore(modal, container.firstChild);

    document.getElementById('closeEditBtn').addEventListener('click', () => { modal.remove(); });
    document.getElementById('revokeAssistantBtn').addEventListener('click', async () => {
      if (!confirm('Revoke verification for this assistant?')) return;
      try {
        const r = await fetcher(`/api/assistants/${assistantId}/reject`, { method: 'POST' });
        const j = await r.json();
        if (j.success) { alert('Assistant unverified'); modal.remove(); loadAssistants(); }
        else alert('Revoke failed');
      } catch (err) { alert(err.message) }
    });

    document.getElementById('saveAssistantBtn').addEventListener('click', async () => {
      const name = document.getElementById('editName').value.trim();
      const station = document.getElementById('editStation').value.trim();
      const langs = document.getElementById('editLangs').value.split(',').map(s=>s.trim()).filter(Boolean);
      try {
        const r = await fetcher(`/api/assistants/${assistantId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, station, languages: langs }) });
        const j = await r.json();
        if (j.success) { alert('Saved'); modal.remove(); loadAssistants(); }
        else alert('Save failed: ' + (j.message||JSON.stringify(j)));
      } catch (err) { alert(err.message) }
    });
  } catch (err) { alert(err.message) }
}
