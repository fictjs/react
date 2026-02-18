import { afterEach, describe, expect, it, vi } from 'vitest'

import { scheduleByClientDirective } from '../src/strategy'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('scheduleByClientDirective', () => {
  it('schedules load/only on microtask', async () => {
    const host = document.createElement('div')
    let loadCount = 0
    let onlyCount = 0

    scheduleByClientDirective('load', host, () => {
      loadCount += 1
    })
    scheduleByClientDirective('only', host, () => {
      onlyCount += 1
    })

    expect(loadCount).toBe(0)
    expect(onlyCount).toBe(0)

    await Promise.resolve()

    expect(loadCount).toBe(1)
    expect(onlyCount).toBe(1)
  })

  it('cancels load mount when cleanup runs before microtask', async () => {
    const host = document.createElement('div')
    let mounted = 0

    const cleanup = scheduleByClientDirective('load', host, () => {
      mounted += 1
    })
    cleanup()

    await Promise.resolve()
    expect(mounted).toBe(0)
  })

  it('uses requestIdleCallback when available', () => {
    const host = document.createElement('div')
    const idleWindow = window as Window & {
      requestIdleCallback?: (cb: IdleRequestCallback) => number
      cancelIdleCallback?: (id: number) => void
    }

    let mounted = 0
    let savedCb: IdleRequestCallback | null = null
    const requestIdle = vi.fn((cb: IdleRequestCallback) => {
      savedCb = cb
      return 42
    })
    const cancelIdle = vi.fn()

    idleWindow.requestIdleCallback = requestIdle
    idleWindow.cancelIdleCallback = cancelIdle

    const cleanup = scheduleByClientDirective('idle', host, () => {
      mounted += 1
    })

    expect(requestIdle).toHaveBeenCalledTimes(1)
    expect(mounted).toBe(0)

    savedCb?.({ didTimeout: false, timeRemaining: () => 5 } as IdleDeadline)
    expect(mounted).toBe(1)

    cleanup()
    expect(cancelIdle).toHaveBeenCalledWith(42)
  })

  it('waits for visibility when IntersectionObserver is available', () => {
    const host = document.createElement('div')
    let mounted = 0
    let observeCount = 0
    let disconnectCount = 0
    let callback: ((entries: IntersectionObserverEntry[]) => void) | null = null

    class FakeObserver {
      constructor(cb: (entries: IntersectionObserverEntry[]) => void) {
        callback = cb
      }

      observe(): void {
        observeCount += 1
      }

      disconnect(): void {
        disconnectCount += 1
      }
    }

    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: FakeObserver,
    })

    const cleanup = scheduleByClientDirective('visible', host, () => {
      mounted += 1
    })

    expect(observeCount).toBe(1)
    expect(mounted).toBe(0)

    callback?.([{ isIntersecting: false } as IntersectionObserverEntry])
    expect(mounted).toBe(0)

    callback?.([{ isIntersecting: true } as IntersectionObserverEntry])
    expect(mounted).toBe(1)

    cleanup()
    expect(disconnectCount).toBeGreaterThan(0)
  })

  it('waits for hover/focus when hover strategy is used', () => {
    const host = document.createElement('div')
    let mounted = 0

    const cleanup = scheduleByClientDirective('hover', host, () => {
      mounted += 1
    })

    expect(mounted).toBe(0)
    host.dispatchEvent(new Event('focusin'))
    expect(mounted).toBe(1)

    cleanup()
  })

  it('waits for configured events when event strategy is used', () => {
    const host = document.createElement('div')
    let mounted = 0

    const cleanup = scheduleByClientDirective(
      'event',
      host,
      () => {
        mounted += 1
      },
      { events: ['custom-ready', 'keydown'] },
    )

    host.dispatchEvent(new Event('click'))
    expect(mounted).toBe(0)
    host.dispatchEvent(new Event('custom-ready'))
    expect(mounted).toBe(1)

    cleanup()
  })

  it('defaults event strategy to click when no event names are provided', () => {
    const host = document.createElement('div')
    let mounted = 0

    const cleanup = scheduleByClientDirective('event', host, () => {
      mounted += 1
    })

    host.dispatchEvent(new Event('click'))
    expect(mounted).toBe(1)

    cleanup()
  })
})
