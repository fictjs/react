import { DEFAULT_VISIBLE_MARGIN } from './constants'
import type { ClientDirective } from './types'

interface ClientScheduleOptions {
  document?: Document
  window?: Window
  visibleRootMargin?: string
}

export function scheduleByClientDirective(
  strategy: ClientDirective,
  host: Element,
  mount: () => void,
  options: ClientScheduleOptions = {},
): () => void {
  const doc = options.document ?? host.ownerDocument
  const win = options.window ?? doc?.defaultView ?? null

  let mounted = false
  const runMount = () => {
    if (mounted) return
    mounted = true
    mount()
  }

  const scheduleLoad = () => {
    queueMicrotask(runMount)
    return () => {}
  }

  if (strategy === 'only' || strategy === 'load') {
    return scheduleLoad()
  }

  if (strategy === 'idle') {
    if (!win) {
      runMount()
      return () => {}
    }

    type IdleWindow = Window & {
      requestIdleCallback?: (cb: IdleRequestCallback) => number
      cancelIdleCallback?: (id: number) => void
    }

    const idleWindow = win as IdleWindow
    if (typeof idleWindow.requestIdleCallback === 'function') {
      const id = idleWindow.requestIdleCallback(() => runMount())
      return () => idleWindow.cancelIdleCallback?.(id)
    }

    const timer = win.setTimeout(runMount, 1)
    return () => win.clearTimeout(timer)
  }

  if (strategy === 'visible') {
    type WindowWithObserver = Window & {
      IntersectionObserver?: typeof IntersectionObserver
    }

    const observerCtor =
      (win as WindowWithObserver | null)?.IntersectionObserver ?? globalThis.IntersectionObserver

    if (!observerCtor) {
      return scheduleLoad()
    }

    const observer = new observerCtor(
      (entries: IntersectionObserverEntry[]) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          observer.disconnect()
          runMount()
          return
        }
      },
      {
        rootMargin: options.visibleRootMargin ?? DEFAULT_VISIBLE_MARGIN,
      },
    )

    observer.observe(host)
    return () => observer.disconnect()
  }

  runMount()
  return () => {}
}
