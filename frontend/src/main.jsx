import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// ----- Service Worker: aktif hanya di production -----
const canUseServiceWorker = 'serviceWorker' in navigator;
const shouldRegisterServiceWorker = canUseServiceWorker && import.meta.env.PROD;

if (shouldRegisterServiceWorker) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[SW] Registered:', registration.scope);
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[SW] New version available — refresh to update.');
            }
          });
        });
      })
      .catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });
  });
} else if (canUseServiceWorker) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      registration.unregister();
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
