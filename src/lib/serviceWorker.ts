let waitingRegistration: ServiceWorkerRegistration | null = null

function notifyUpdateAvailable(registration: ServiceWorkerRegistration) {
  waitingRegistration = registration
  window.dispatchEvent(
    new CustomEvent('app-update-available', {
      detail: { registration },
    })
  )
}

export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          notifyUpdateAvailable(registration)
        }

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing
          if (!worker) return

          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              notifyUpdateAvailable(registration)
            }
          })
        })
      })
      .catch((error) => console.error('Service worker registration failed:', error))
  })
}

export function applyServiceWorkerUpdate(registration = waitingRegistration): void {
  registration?.waiting?.postMessage({ type: 'SKIP_WAITING' })
}
