import { DEFAULT_VISIBLE_MARGIN } from './constants'
import type { ClientDirective } from './types'

interface ClientScheduleOptions {
  document?: Document
  window?: Window
  visibleRootMargin?: string
  events?: string[]
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
  let canceled = false
  const runMount = () => {
    if (mounted || canceled) return
    mounted = true
    mount()
  }

  const bindHostEvents = (eventNames: readonly string[]) => {
    const names = eventNames.length > 0 ? eventNames : ['click']
    const listeners: { name: string; handler: EventListener }[] = []

    for (const name of names) {
      const handler: EventListener = () => {
        runMount()
      }
      listeners.push({ name, handler })
      host.addEventListener(name, handler, { once: true })
    }

    return () => {
      canceled = true
      for (const { name, handler } of listeners) {
        host.removeEventListener(name, handler)
      }
    }
  }

  const scheduleLoad = () => {
    queueMicrotask(runMount)
    return () => {
      canceled = true
    }
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

  if (strategy === 'hover') {
    return bindHostEvents(['mouseover', 'focusin'])
  }

  if (strategy === 'event') {
    return bindHostEvents(options.events ?? [])
  }

  runMount()
  return () => {}
}
