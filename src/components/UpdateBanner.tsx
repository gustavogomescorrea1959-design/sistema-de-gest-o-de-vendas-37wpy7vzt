/**
 * PWA auto-update banner.
 *
 * The service worker (public/sw.js) stays in "waiting" state after a new
 * version is downloaded. main.tsx detects that via registration.updatefound
 * and calls `setUpdateAvailable(true)` here. The banner then shows a
 * "Nova versão disponível" prompt; tapping "Atualizar" posts SKIP_WAITING to
 * the waiting worker, which activates it, then the page reloads on
 * `controllerchange` to load the new version — no manual cache clearing.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type UpdateContextValue = {
  updateAvailable: boolean
  /** Called by main.tsx when the SW reports a waiting worker. */
  setUpdateAvailable: (value: boolean) => void
  /** Reload the page using the freshly activated service worker. */
  updateApp: () => void
}

const UpdateAvailableContext = createContext<UpdateContextValue | null>(null)

export function UpdateAvailableProvider({ children }: { children: ReactNode }) {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  const updateApp = useCallback(() => {
    if (!('serviceWorker' in navigator)) {
      // No service worker (desktop browser without SW): just reload.
      window.location.reload()
      return
    }

    // When the new worker takes over as controller, reload to serve it.
    let reloading = false
    const onControllerChange = () => {
      if (reloading) return
      reloading = true
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    // Safety net: if controllerchange never fires (older browsers, already
    // active worker), reload after a short delay so the user still sees the
    // new version.
    const fallback = setTimeout(() => {
      if (!reloading) {
        reloading = true
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
        window.location.reload()
      }
    }, 1500)

    // Tell the waiting worker to activate immediately. `waiting` lives on
    // the ServiceWorkerRegistration, so resolve it via `.ready` first.
    navigator.serviceWorker.ready
      .then((registration) => {
        const waiting = registration.waiting
        if (waiting) {
          waiting.postMessage('SKIP_WAITING')
        } else {
          // No waiting worker (already active or nothing pending): reload now.
          clearTimeout(fallback)
          if (!reloading) {
            reloading = true
            window.location.reload()
          }
        }
      })
      .catch(() => {
        clearTimeout(fallback)
        if (!reloading) {
          reloading = true
          window.location.reload()
        }
      })
  }, [])

  // When the new worker becomes the controller without an explicit banner
  // action (e.g. on first install), make sure we don't leave a stale banner.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onControllerChange = () => {
      if (!navigator.serviceWorker.controller) {
        setUpdateAvailable(false)
      }
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }, [])

  const value = useMemo<UpdateContextValue>(
    () => ({ updateAvailable, setUpdateAvailable, updateApp }),
    [updateAvailable, updateApp],
  )

  return <UpdateAvailableContext.Provider value={value}>{children}</UpdateAvailableContext.Provider>
}

/**
 * Access the update state from anywhere below <UpdateAvailableProvider />.
 * Returns `{ updateAvailable, updateApp }`.
 */
export function useUpdateAvailable() {
  const ctx = useContext(UpdateAvailableContext)
  if (!ctx) {
    throw new Error('useUpdateAvailable must be used within an UpdateAvailableProvider')
  }
  // Only expose what callers need.
  return { updateAvailable: ctx.updateAvailable, updateApp: ctx.updateApp }
}

/**
 * Watches the service worker registration for an `updatefound` event (a new
 * version is being installed) and flips the banner on when a worker reaches
 * the "installed/waiting" state. Render this once inside the provider, near
 * the app root, so it runs on every route.
 *
 * This component renders nothing — the banner is drawn separately by <UpdateBanner />.
 */
export function ServiceWorkerUpdater() {
  // Read the context directly: useUpdateAvailable() only exposes the public
  // { updateAvailable, updateApp } shape, but we also need setUpdateAvailable
  // here to push updates into the provider.
  const ctx = useContext(UpdateAvailableContext)
  const setUpdateAvailable = ctx?.setUpdateAvailable

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !setUpdateAvailable) return

    let registration: ServiceWorkerRegistration | undefined
    navigator.serviceWorker
      .register('/sw.js?v=3')
      .then((reg) => {
        registration = reg
        // A new SW has appeared in the browser; follow it through install.
        reg.addEventListener('updatefound', () => {
          const installingWorker = reg.installing
          if (!installingWorker) return
          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // A previous controller exists → this is an UPDATE, not first install.
              setUpdateAvailable(true)
            }
          })
        })
      })
      .catch((err) => console.warn('Service worker registration failed:', err))

    // Also honour an explicit "UPDATE_AVAILABLE" message posted by the SW
    // (forward-compat) in addition to the updatefound/statechange flow above.
    const onMessage = (event: MessageEvent) => {
      if (event.data === 'UPDATE_AVAILABLE') {
        setUpdateAvailable(true)
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)

    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage)
      void registration
    }
  }, [setUpdateAvailable])

  return null
}

/**
 * Fixed banner shown at the very top of the viewport whenever a new PWA
 * version is waiting. Rendered once near the app root so it appears on every
 * route (including /dashboard).
 */
export function UpdateBanner() {
  const { updateAvailable, updateApp } = useUpdateAvailable()
  const [dismissed, setDismissed] = useState(false)

  if (!updateAvailable || dismissed) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-[100] flex items-center justify-between gap-3 px-4 py-2.5 text-white shadow-lg"
      style={{ backgroundColor: '#87c49c' }}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <RefreshCw className="h-4 w-4 shrink-0" />
        <span>Nova versão disponível</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="h-8 bg-white text-[#2f6b47] hover:bg-white/90 hover:text-[#2f6b47] font-semibold"
          onClick={updateApp}
        >
          Atualizar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-white hover:bg-white/20 hover:text-white"
          aria-label="Fechar"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
