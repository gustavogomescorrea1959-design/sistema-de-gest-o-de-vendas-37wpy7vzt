/* Main entry point for the application - renders the root React component */
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './main.css'
import {
  UpdateAvailableProvider,
  ServiceWorkerUpdater,
  UpdateBanner,
} from '@/components/UpdateBanner'

// Register the service worker with a cache-busting query string (?v=3) so
// Safari/iOS fetches a fresh sw.js instead of re-serving the stale v1 it has
// pinned in its HTTP cache. registration.update() forces an immediate check
// for a new version on every app load. ServiceWorkerUpdater (in UpdateBanner)
// registers the same URL and wires updatefound to the "Nova versão" banner.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js?v=3')
    .then((registration) => registration.update())
    .catch((err) => console.warn('Service worker registration failed:', err))
}

// @skip-protected: Do not remove. Required for React rendering.
createRoot(document.getElementById('root')!).render(
  <UpdateAvailableProvider>
    <ServiceWorkerUpdater />
    <UpdateBanner />
    <App />
  </UpdateAvailableProvider>,
)
