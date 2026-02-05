// auth helpers: register, login, token storage
const API_BASE = '/api';

function getToken() { return localStorage.getItem('railcare_token'); }
function setToken(t) {
  if (t) {
    localStorage.setItem('railcare_token', t);
    try { localStorage.setItem('railcare_logged_in', '1'); } catch (e) {}
  } else {
    localStorage.removeItem('railcare_token');
    try { localStorage.removeItem('railcare_logged_in'); } catch (e) {}
  }
}
function authFetch(url, opts = {}) {
  opts.headers = opts.headers || {};
  const token = getToken();
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  return fetch(url, opts);
}

async function getCurrentUser() {
  try {
    const res = await authFetch('/api/auth/me');
    if (!res.ok) return null;
    const j = await res.json();
    return j.success ? j.user : null;
  } catch (e) { return null; }
}

async function enforceRole(required) {
  // required can be string or array
  const reqs = Array.isArray(required) ? required : [required];
  const user = await getCurrentUser();
  if (!user) { window.location.href = 'login-premium.html'; return false; }
  if (!reqs.includes(user.role)) { window.location.href = 'login-premium.html'; return false; }
  return true;
}

document.addEventListener('DOMContentLoaded', () => {
  const registerBtn = document.getElementById('registerBtn');
  const loginBtn = document.getElementById('loginBtn');
  if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
      const name = document.getElementById('regName').value;
      const phone = document.getElementById('regPhone').value;
      const password = document.getElementById('regPassword').value;
      const role = document.getElementById('regRole').value;
      const res = await fetch(API_BASE + '/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, password, role })
      });
      const j = await res.json();
      const msg = document.getElementById('regMsg');
      if (j.success && j.token) {
        setToken(j.token);
        msg.textContent = 'Registered and logged in.';
        setTimeout(() => window.location.href = role === 'assistant' ? 'assistant.html' : role === 'admin' ? 'admin.html' : 'passenger.html', 500);
      } else {
        msg.textContent = j.message || j.error || 'Registration failed';
      }
    });
  }
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const phone = document.getElementById('loginPhone').value;
      const password = document.getElementById('loginPassword').value;
      const res = await fetch(API_BASE + '/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password })
      });
      const j = await res.json();
      const msg = document.getElementById('loginMsg');
      if (j.success && j.token) {
        setToken(j.token);
        msg.textContent = 'Logged in.';
        const redirect = j.user && j.user.role === 'assistant' ? 'assistant.html' : j.user && j.user.role === 'admin' ? 'admin.html' : 'passenger.html';
        setTimeout(() => window.location.href = redirect, 400);
      } else {
        msg.textContent = j.message || j.error || 'Login failed';
      }
    });
  }

    // Forgot password handlers
    const forgotLink = document.getElementById('forgotLink');
    const forgotArea = document.getElementById('forgotArea');
    const requestResetBtn = document.getElementById('requestResetBtn');
    const resetMsg = document.getElementById('resetMsg');
    const doResetBtn = document.getElementById('doResetBtn');
    if (forgotLink && forgotArea) {
      forgotLink.addEventListener('click', (e) => { e.preventDefault(); forgotArea.style.display = forgotArea.style.display === 'none' ? 'block' : 'none'; });
    }
    if (requestResetBtn) {
      requestResetBtn.addEventListener('click', async () => {
        const phone = document.getElementById('resetPhone').value;
        if (!phone) return resetMsg.textContent = 'Enter phone';
        try {
          const res = await fetch(API_BASE + '/auth/request-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
          const j = await res.json();
          if (j.success) { resetMsg.textContent = 'Reset token: ' + (j.token || 'sent'); }
          else resetMsg.textContent = j.message || 'Request failed';
        } catch (e) { resetMsg.textContent = e.message }
      });
    }
    if (doResetBtn) {
      doResetBtn.addEventListener('click', async () => {
        const phone = document.getElementById('resetPhone').value;
        const token = document.getElementById('resetToken').value;
        const newPassword = document.getElementById('resetNewPassword').value;
        if (!phone || !token || !newPassword) return resetMsg.textContent = 'Fill phone, token, and new password';
        try {
          const res = await fetch(API_BASE + '/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, token, newPassword }) });
          const j = await res.json();
          if (j.success && j.token) {
            setToken(j.token);
            resetMsg.textContent = 'Password reset and logged in';
            setTimeout(() => window.location.href = j.user && j.user.role === 'assistant' ? 'assistant.html' : j.user && j.user.role === 'admin' ? 'admin.html' : 'passenger.html', 500);
          } else resetMsg.textContent = j.message || 'Reset failed';
        } catch (e) { resetMsg.textContent = e.message }
      });
    }
    // Toggle between login and register panels on the login page
    const showRegister = document.getElementById('showRegister');
    const backToLogin = document.getElementById('backToLogin');
    if (showRegister) showRegister.addEventListener('click', (e) => {
      e.preventDefault();
      const ra = document.getElementById('registerArea');
      const la = document.getElementById('loginArea');
      if (ra && la) { ra.style.display = 'block'; la.style.display = 'none'; }
    });
    if (backToLogin) backToLogin.addEventListener('click', (e) => {
      e.preventDefault();
      const ra = document.getElementById('registerArea');
      const la = document.getElementById('loginArea');
      if (ra && la) { ra.style.display = 'none'; la.style.display = 'block'; }
    });
});

// Expose helper for other scripts
window.RailCareAuth = { getToken, setToken, authFetch, getCurrentUser, enforceRole };

// show logged-in user in header and provide logout
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Only show greeting if user explicitly logged in this session (not just a stored token)
    const loggedIn = localStorage.getItem('railcare_logged_in') === '1';
    if (!loggedIn) return;
    const user = await getCurrentUser();
    if (!user) return;
    // Prefer assistant entity name for assistant users (if available)
    let displayName = user.name || '';
    if (user.role === 'assistant') {
      try {
        const fetcher = window.RailCareAuth?.authFetch || fetch;
        const res = await fetcher('/api/assistants');
        if (res.ok) {
          const list = await res.json();
          // backend may return array; find by userId or name
          const found = Array.isArray(list) ? list.find(a => (a.userId && a.userId === user._id) || a.name === user.name) : null;
          if (found && found.name) displayName = found.name;
        }
      } catch (e) { /* ignore */ }
    }
    const header = document.querySelector('header.site-header');
    if (!header) return;
    const userWrap = document.createElement('div');
    userWrap.className = 'header-user';
    userWrap.style.marginLeft = '16px';
    userWrap.innerHTML = `
      <div class="user-dropdown">
        <span class="user-greet" style="margin-right:12px;opacity:0.9">Hello, <strong id="hdrName">${user.name}</strong></span>
        <button id="userMenuBtn" class="btn-secondary">Menu</button>
        <div id="userMenu" class="card" style="position:absolute;right:32px;top:64px;display:none;z-index:40;padding:10px;width:200px">
          <div style="margin-bottom:8px"><button id="callSupport" class="btn-secondary">Call Support</button></div>
          <div style="margin-bottom:8px"><button id="bookingBtn" class="btn-secondary">Booking</button></div>
          <div style="margin-bottom:8px"><button id="myBookingsBtn" class="btn-secondary">My Bookings</button></div>
          <div style="margin-bottom:8px"><button id="settingsBtn" class="btn-secondary">Settings</button></div>
          <div style="margin-bottom:0"><a href="#" id="logoutBtn">Logout</a></div>
        </div>
      </div>`;
    header.appendChild(userWrap);
    const menuBtn = document.getElementById('userMenuBtn');
    const userMenu = document.getElementById('userMenu');
    if (menuBtn) menuBtn.addEventListener('click', (e) => { e.preventDefault(); userMenu.style.display = userMenu.style.display === 'block' ? 'none' : 'block'; });
    // menu actions
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', (e) => { e.preventDefault(); setToken(null); try{ localStorage.removeItem('railmitra_assistantId'); }catch(e){}; window.location.href = 'login-premium.html'; });
    const myBtn = document.getElementById('myBookingsBtn');
    if (myBtn) myBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        // Route the action based on user role
        if (user.role === 'assistant') {
          // If assistant page helpers present, use them; else navigate
          if (window.renderAssistant && window.loadBookings && window.startAssistantPolling) {
            try { await window.renderAssistant?.(); } catch (e) {}
            try { await window.loadBookings?.(); } catch (e) {}
            try { window.startAssistantPolling?.(); } catch (e) {}
            userMenu.style.display = 'none';
            return;
          }
          window.location.href = 'assistant.html';
          return;
        }
        if (user.role === 'admin') {
          // Admin: go to admin dashboard
          window.location.href = 'admin.html';
          return;
        }
        // Default: passenger behavior
        const passApp = window.renderBookingsFor && window.startPassengerPolling;
        if (passApp) {
          const name = user.name;
          const vn = document.getElementById('viewName'); if (vn) vn.value = name;
          await window.renderBookingsFor?.(name);
          window.startPassengerPolling?.(name);
          userMenu.style.display = 'none';
        } else {
          window.location.href = 'passenger.html';
        }
      } catch (err) { /* ignore */ }
    });
    const bookingBtn = document.getElementById('bookingBtn');
    if (bookingBtn) bookingBtn.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        // If passenger app helpers present, use them; else reveal form on page
        const name = user.name;
        if (window.showBookingForm) {
          window.showBookingForm(name);
        } else {
          const form = document.getElementById('bookingForm');
          const card = form ? form.closest('.card') : null;
          if (card) {
            card.style.display = 'block';
            const vn = document.getElementById('viewName'); if (vn) vn.value = name;
            try { window.renderBookingsFor?.(name); window.startPassengerPolling?.(name); } catch(e){}
            card.scrollIntoView({ behavior: 'smooth' });
          } else {
            // not on passenger page, navigate there
            window.location.href = 'passenger.html';
          }
        }
        userMenu.style.display = 'none';
      } catch (err) { /* ignore */ }
    });
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) settingsBtn.addEventListener('click', (e) => { e.preventDefault(); openSettingsModal(user); userMenu.style.display = 'none'; });
    const callBtn = document.getElementById('callSupport');
    if (callBtn) callBtn.addEventListener('click', (e) => { e.preventDefault(); window.location.href = 'tel:+911234567890'; });
  } catch (e) { /* ignore */ }
});

// Settings modal: edit profile and theme
function openSettingsModal(user) {
  // modal container
  let m = document.getElementById('rcSettingsModal');
  if (m) { m.style.display = 'block'; return; }
  m = document.createElement('div');
  m.id = 'rcSettingsModal';
  m.style.position = 'fixed';m.style.left='0';m.style.top='0';m.style.right='0';m.style.bottom='0';m.style.background='rgba(0,0,0,0.4)';m.style.display='flex';m.style.alignItems='center';m.style.justifyContent='center';m.style.zIndex=60;
  m.innerHTML = `<div class="card" style="width:320px;padding:16px;position:relative">
    <h3>Settings</h3>
    <label>Name</label>
    <input id="settingsName" value="${user.name}" />
    <label>Phone</label>
    <input id="settingsPhone" value="${user.phone||''}" />
    <div style="margin:8px 0"><label><input type="checkbox" id="themeToggle" /> Dark theme</label></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button id="saveSettings" class="btn-primary">Save</button><button id="closeSettings" class="btn-secondary">Close</button></div>
  </div>`;
  document.body.appendChild(m);
  const close = document.getElementById('closeSettings');
  close.addEventListener('click', () => m.style.display='none');
  const save = document.getElementById('saveSettings');
  save.addEventListener('click', async () => {
    const name = document.getElementById('settingsName').value.trim();
    const phone = document.getElementById('settingsPhone').value.trim();
    const dark = document.getElementById('themeToggle').checked;
    // apply theme locally
    if (dark) document.body.classList.add('dark-theme'); else document.body.classList.remove('dark-theme');
    localStorage.setItem('railcare_theme_dark', dark ? '1' : '0');
    // send profile update
    try {
      const res = await authFetch('/api/auth/update', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone }) });
      const j = await res.json();
      if (j.success) {
        if (j.token) setToken(j.token);
        const hdr = document.getElementById('hdrName'); if (hdr) hdr.textContent = j.user.name;
        alert('Profile updated');
        m.style.display='none';
      } else {
        alert(j.message || 'Update failed');
      }
    } catch (err) { alert(err.message) }
  });
  // set theme toggle initial
  const cur = localStorage.getItem('railcare_theme_dark');
  document.getElementById('themeToggle').checked = cur === '1';
}

// apply stored theme on load
document.addEventListener('DOMContentLoaded', () => {
  try { if (localStorage.getItem('railcare_theme_dark') === '1') document.body.classList.add('dark-theme'); } catch(e){}
});
