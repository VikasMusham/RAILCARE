// Simple Socket.IO client loader for chat
// This file is loaded by passenger-premium.html and admin-premium.html

(function() {
  if (window.io) return; // Already loaded
  var script = document.createElement('script');
  script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
  script.onload = function() {
    window.ioLoaded = true;
    document.dispatchEvent(new Event('socketio-ready'));
  };
  document.head.appendChild(script);
})();
