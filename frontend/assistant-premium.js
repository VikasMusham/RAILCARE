// All JS logic from the previous inline script in assistant-premium.html
// ==================== TOAST NOTIFICATION ====================
function showToast(message, duration = 4000) {
  const existingToast = document.getElementById('assistantToast');
  if (existingToast) existingToast.remove();
  const toast = document.createElement('div');
  toast.id = 'assistantToast';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--text-primary);
    color: var(--bg-primary);
    padding: 16px 24px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 500;
    z-index: 10000;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    animation: slideUp 0.3s ease-out;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease-out forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ==================== THEME ====================
function toggleTheme() {
  document.body.classList.toggle('dark');
  localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
}
if (localStorage.getItem('theme') === 'dark') {
  document.body.classList.add('dark');
}

// ==================== USER PROFILE ====================
let navCurrentUser = null;
let userAvatar = null;

function getToken() {
  return localStorage.getItem('railcare_token');
}

function checkAuthNav() {
  const token = getToken();
  console.log('[DEBUG][checkAuthNav] token:', token);
  // ...existing code...
}

// ...existing code...
// Move all other inline JS logic from assistant-premium.html here
