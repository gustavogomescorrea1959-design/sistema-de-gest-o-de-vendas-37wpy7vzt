/* Main entry point for the application - renders the root React component */
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './main.css'
import {
  UpdateAvailableProvider,
  ServiceWorkerUpdater,
  UpdateBanner,
} from '@/components/UpdateBanner'

// Service worker registration now happens inside <ServiceWorkerUpdater />
// (in UpdateBanner.tsx), so the updatefound flow is wired to the banner.

// @skip-protected: Do not remove. Required for React rendering.
createRoot(document.getElementById('root')!).render(
  <UpdateAvailableProvider>
    <ServiceWorkerUpdater />
    <UpdateBanner />
    <App />
  </UpdateAvailableProvider>,
)
