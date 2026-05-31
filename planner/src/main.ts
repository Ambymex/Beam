import './app.css';
import App from './App.svelte';

const app = new App({ target: document.getElementById('app')! });

// Register the service worker (PWA socket — the push spine lands in step 7, §7).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

export default app;
