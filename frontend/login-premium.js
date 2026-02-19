// login-premium.js
// All logic moved from inline script in login-premium.html

// Theme Toggle
function toggleTheme() {
  document.body.classList.toggle('dark');
  localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
}

// Load saved theme
if (localStorage.getItem('theme') === 'dark') {
  document.body.classList.add('dark');
}

// Form Switching
function showForm(form) {
  document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  if (form === 'login') {
    document.querySelectorAll('.auth-tab')[0].classList.add('active');
    document.getElementById('loginForm').classList.add('active');
  } else {
    document.querySelectorAll('.auth-tab')[1].classList.add('active');
    document.getElementById('registerForm').classList.add('active');
  }
}

// Toggle Password Visibility
function togglePassword(inputId, button) {
  const input = document.getElementById(inputId);
  const type = input.type === 'password' ? 'text' : 'password';
  input.type = type;
  // Change button color for visual feedback
  if (type === 'text') {
    button.style.backgroundColor = '#e0ffe0'; // light green
    button.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="green" stroke-width="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>`;
  } else {
    button.style.backgroundColor = '';
    button.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    </svg>`;
  }
}

// Password Strength
function checkPasswordStrength(password) {
  const bar = document.getElementById('passwordStrengthBar');
  bar.className = 'password-strength-bar';
  if (password.length === 0) {
    bar.style.width = '0';
    return;
  }
  let strength = 0;
  if (password.length >= 8) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[^a-zA-Z0-9]/.test(password)) strength++;
  if (strength <= 1) bar.classList.add('weak');
  else if (strength <= 2) bar.classList.add('medium');
  else bar.classList.add('strong');
}

// Toggle Reset Section
function toggleReset(e) {
  e.preventDefault();
  document.getElementById('resetSection').classList.toggle('active');
}

// API Base
const API = '/api';

// Show Message
function showMessage(elementId, text, type) {
  const el = document.getElementById(elementId);
  el.textContent = text;
  el.className = 'message ' + type;
}

// Login Handler
if (document.getElementById('loginForm')) {
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<div class="loading"></div><span>Signing in...</span>';
    btn.disabled = true;
    try {
      document.getElementById('loginPhone').blur();
      document.getElementById('loginPassword').blur();
      const phone = document.getElementById('loginPhone').value;
      const password = document.getElementById('loginPassword').value;
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setToken(data.token);
        showMessage('loginMsg', 'Login successful! Redirecting...', 'success');
        const payload = JSON.parse(atob(data.token.split('.')[1]));
        setTimeout(() => {
          if (payload.role === 'admin') {
            window.location.href = 'admin-premium.html';
          } else if (payload.role === 'assistant') {
            window.location.href = 'assistant-premium.html';
          } else {
            window.location.href = 'passenger-premium.html';
          }
        }, 1000);
      } else {
        showMessage('loginMsg', data.message || 'Login failed', 'error');
      }
    } catch (err) {
      showMessage('loginMsg', 'Connection error. Please try again.', 'error');
    }
    btn.innerHTML = originalContent;
    btn.disabled = false;
  });
}

// Register Handler
if (document.getElementById('registerForm')) {
  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('registerBtn');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<div class="loading"></div><span>Creating account...</span>';
    btn.disabled = true;
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('regName').value,
          phone: document.getElementById('regPhone').value,
          password: document.getElementById('regPassword').value,
          role: document.getElementById('regRole').value
        })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setToken(data.token);
        showMessage('regMsg', 'Account created! Redirecting...', 'success');
        const payload = JSON.parse(atob(data.token.split('.')[1]));
        setTimeout(() => {
          if (payload.role === 'admin') {
            window.location.href = 'admin-premium.html';
          } else if (payload.role === 'assistant') {
            window.location.href = 'assistant-premium.html';
          } else {
            window.location.href = 'passenger-premium.html';
          }
        }, 1000);
      } else if (res.ok) {
        showMessage('regMsg', 'Account created! You can now sign in.', 'success');
        setTimeout(() => showForm('login'), 1500);
      } else {
        showMessage('regMsg', data.message || 'Registration failed', 'error');
      }
    } catch (err) {
      showMessage('regMsg', 'Connection error. Please try again.', 'error');
    }
    btn.innerHTML = originalContent;
    btn.disabled = false;
  });
}

// Password Reset Request
async function requestReset() {
  const phone = document.getElementById('resetPhone').value;
  if (!phone) {
    showMessage('resetMsg', 'Please enter your phone number', 'error');
    return;
  }
  try {
    const res = await fetch(`${API}/auth/request-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();
    showMessage('resetMsg', data.message || 'Check your phone for the reset token', 'success');
  } catch (err) {
    showMessage('resetMsg', 'Connection error', 'error');
  }
}

// Password Reset
async function doReset() {
  const phone = document.getElementById('resetPhone').value;
  const token = document.getElementById('resetToken').value;
  const newPassword = document.getElementById('resetNewPassword').value;
  if (!phone || !token || !newPassword) {
    showMessage('resetMsg', 'Please fill in all fields', 'error');
    return;
  }
  try {
    const res = await fetch(`${API}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, token, newPassword })
    });
    const data = await res.json();
    if (res.ok) {
      showMessage('resetMsg', 'Password reset successfully! You can now login.', 'success');
      document.getElementById('resetSection').classList.remove('active');
    } else {
      showMessage('resetMsg', data.msg || 'Reset failed', 'error');
    }
  } catch (err) {
    showMessage('resetMsg', 'Connection error', 'error');
  }
}

// No auto-redirect on login page
// Add event listener for password toggle (CSP safe)
document.addEventListener('DOMContentLoaded', function() {
  const toggleBtn = document.getElementById('toggleLoginPasswordBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function() {
      togglePassword('loginPassword', toggleBtn);
    });
  }
});
