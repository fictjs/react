import { prop, render } from '@fictjs/runtime'
import { createSignal } from '@fictjs/runtime/advanced'
import { __fictDisableSSR, __fictEnableSSR } from '@fictjs/runtime/internal'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { installReactIslands, reactAction$, reactify$ } from '../src'
import { encodePropsForAttribute } from '../src/serialization'
import {
  __resetLoaderComponentModuleLoaderForTests,
  __resetResumableComponentModuleLoaderForTests,
  __setLoaderComponentModuleLoaderForTests,
  __setResumableComponentModuleLoaderForTests,
} from '../src/testing'

const tick = async (ms = 0) => {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

const waitForElement = async <T extends Element>(
  root: ParentNode,
  selector: string,
  timeoutMs = 1_000,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const element = root.querySelector(selector)
    if (element) {
      return element as T
    }
    await tick(10)
  }

  throw new Error(`Timed out waiting for selector: ${selector}`)
}

const waitForExpectation = async (assertion: () => void, timeoutMs = 1_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await tick(10)
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Timed out waiting for asynchronous expectation.')
}

afterEach(() => {
  const runtimeHost = globalThis as { __FICT_DEV__?: boolean }
  runtimeHost.__FICT_DEV__ = undefined
  document.body.innerHTML = ''
  __fictDisableSSR()
  __resetLoaderComponentModuleLoaderForTests()
  __resetResumableComponentModuleLoaderForTests()
})

describe('reactify$', () => {
  it('supports dynamic import mount without local component reference', async () => {
    const fixtureModule = new URL('./fixtures/loader-component.ts', import.meta.url).href
    const Remote = reactify$<{ label: string; count: number }>({
      module: fixtureModule,
      export: 'LoaderComponent',
      ssr: false,
    })

    function App() {
      const count = createSignal(1)
      return {
        type: 'div',
        props: {
          children: [
            {
              type: 'button',
              props: {
                id: 'bump',
                onClick: () => count(count() + 1),
                children: 'bump',
              },
            },
            {
              type: Remote,
              props: {
                label: 'remote',
                count: prop(() => count()),
              },
            },
          ],
        },
      }
    }

    const container = document.createElement('div')
    document.body.appendChild(container)

    const dispose = render(() => ({ type: App, props: {} }), container)
    await tick(20)

    expect(container.textContent).toContain('remote:1')
    ;(container.querySelector('#bump') as HTMLButtonElement).click()
    await tick(20)

    expect(container.textContent).toContain('remote:2')

    dispose()
  })

  it('renders SSR shell attributes and serialized props', () => {
    function Inline(props: { text: string }) {
      return React.createElement('strong', null, props.text)
    }

    const InlineIsland = reactify$<{ text: string }>({
      module: import.meta.url,
      export: 'Inline',
      component: Inline,
      ssr: true,
      client: 'visible',
    })

    const container = document.createElement('div')
    document.body.appendChild(container)

    __fictEnableSSR()
    const dispose = render(() => ({ type: InlineIsland, props: { text: 'from-ssr' } }), container)
    __fictDisableSSR()

    const host = container.querySelector('[data-fict-react]') as HTMLElement | null
    expect(host).not.toBeNull()
    expect(host?.getAttribute('data-fict-react-client')).toBe('visible')
    expect(host?.getAttribute('data-fict-react-ssr')).toBe('1')
    expect(host?.getAttribute('data-fict-react-props')).toBeTruthy()
    expect(host?.innerHTML).toContain('<strong>from-ssr</strong>')

    dispose()
  })

  it('materializes serialized action refs into callable React callbacks', async () => {
    const componentModule = new URL('./fixtures/action-button-component.tsx', import.meta.url).href
    const actionModule = new URL('./fixtures/react-action-handler.ts', import.meta.url).href
    const actionHost = globalThis as { __FICT_REACT_ACTION_CALLS__?: string[] }
    actionHost.__FICT_REACT_ACTION_CALLS__ = []

    const ActionIsland = reactify$<{ label: string; onAction: ReturnType<typeof reactAction$> }>({
      module: componentModule,
      export: 'ActionButtonComponent',
      ssr: false,
    })

    const container = document.createElement('div')
    document.body.appendChild(container)

    const dispose = render(
      () => ({
        type: ActionIsland,
        props: {
          label: 'run',
          onAction: reactAction$(actionModule, 'recordReactAction'),
        },
      }),
      container,
    )
    try {
      const actionButton = await waitForElement<HTMLButtonElement>(container, '#action-button')
      actionButton.click()
      await waitForExpectation(() => {
        expect(actionHost.__FICT_REACT_ACTION_CALLS__).toEqual(['clicked:run'])
      })
    } finally {
      dispose()
    }
  })

  it('materializes configured non-onX action props from reactify$ options', async () => {
    const componentModule = new URL('./fixtures/custom-action-component.tsx', import.meta.url).href
    const actionModule = new URL('./fixtures/react-action-handler.ts', import.meta.url).href
    const actionHost = globalThis as { __FICT_REACT_ACTION_CALLS__?: string[] }
    actionHost.__FICT_REACT_ACTION_CALLS__ = []

    const CustomActionIsland = reactify$<{
      label: string
      submitAction: ReturnType<typeof reactAction$>
    }>({
      module: componentModule,
      export: 'CustomActionComponent',
      ssr: false,
      actionProps: ['submitAction'],
    })

    const container = document.createElement('div')
    document.body.appendChild(container)

    const dispose = render(
      () => ({
        type: CustomActionIsland,
        props: {
          label: 'option',
          submitAction: reactAction$(actionModule, 'recordReactAction'),
        },
      }),
      container,
    )
    try {
      const customActionButton = await waitForElement<HTMLButtonElement>(
        container,
        '#custom-action-button',
      )
      customActionButton.click()
      await waitForExpectation(() => {
        expect(actionHost.__FICT_REACT_ACTION_CALLS__).toEqual(['custom:option'])
      })
    } finally {
      dispose()
    }
  })

  it('recovers from transient component load failures with bounded backoff retries', async () => {
    const fixtureModule = new URL('./fixtures/loader-component.ts', import.meta.url).href
    let attempts = 0

    __setResumableComponentModuleLoaderForTests(async (resolvedUrl) => {
      attempts += 1
      if (attempts === 1) {
        throw new Error('transient-load-failure')
      }

      return (await import(/* @vite-ignore */ resolvedUrl)) as Record<string, unknown>
    })

    const Remote = reactify$<{ label: string; count: number }>({
      module: fixtureModule,
      export: 'LoaderComponent',
      ssr: false,
    })

    const container = document.createElement('div')
    document.body.appendChild(container)

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispose = render(() => ({ type: Remote, props: { label: 'retry', count: 7 } }), container)
    try {
      expect(container.textContent).not.toContain('retry:7')

      await waitForExpectation(() => {
        expect(attempts).toBe(2)
      })
      await waitForExpectation(() => {
        expect(container.textContent).toContain('retry:7')
      })
    } finally {
      dispose()
      consoleSpy.mockRestore()
    }
  })

  it('supports event-triggered mount and serializes event metadata', async () => {
    const fixtureModule = new URL('./fixtures/loader-component.ts', import.meta.url).href
    const Remote = reactify$<{ label: string; count: number }>({
      module: fixtureModule,
      export: 'LoaderComponent',
      ssr: false,
      client: 'event',
      event: ['custom-ready'],
    })

    const container = document.createElement('div')
    document.body.appendChild(container)

    const dispose = render(
      () => ({
        type: Remote,
        props: { label: 'event-remote', count: 4 },
      }),
      container,
    )
    try {
      const host = container.querySelector('[data-fict-react]') as HTMLElement | null
      expect(host).not.toBeNull()
      expect(host?.getAttribute('data-fict-react-client')).toBe('event')
      expect(host?.getAttribute('data-fict-react-event')).toBe('custom-ready')

      await tick(30)
      expect(container.textContent).not.toContain('event-remote:4')

      host?.dispatchEvent(new Event('custom-ready'))
      await waitForExpectation(() => {
        expect(container.textContent).toContain('event-remote:4')
      })
    } finally {
      dispose()
    }
  })

  it('uses a custom host tag name when configured', async () => {
    const fixtureModule = new URL('./fixtures/loader-component.ts', import.meta.url).href
    const Remote = reactify$<{ label: string; count: number }>({
      module: fixtureModule,
      export: 'LoaderComponent',
      ssr: false,
      tagName: 'section',
    })

    const container = document.createElement('div')
    document.body.appendChild(container)

    const dispose = render(
      () => ({
        type: Remote,
        props: { label: 'host-tag', count: 8 },
      }),
      container,
    )
    try {
      const host = container.querySelector('[data-fict-react]') as HTMLElement | null
      expect(host).not.toBeNull()
      expect(host?.tagName).toBe('SECTION')

      await waitForExpectation(() => {
        expect(container.textContent).toContain('host-tag:8')
      })
    } finally {
      dispose()
    }
  })
})

describe('installReactIslands', () => {
  it('hydrates/mounts hosts and re-renders on serialized props updates', async () => {
    const fixtureModule = new URL('./fixtures/loader-component.ts', import.meta.url).href
    const host = document.createElement('div')
    host.setAttribute('data-fict-react', `${fixtureModule}#LoaderComponent`)
    host.setAttribute('data-fict-react-client', 'load')
    host.setAttribute('data-fict-react-ssr', '0')
    host.setAttribute(
      'data-fict-react-props',
      encodePropsForAttribute({ label: 'loader', count: 5 }),
    )

    document.body.appendChild(host)

    const stop = installReactIslands()
    await tick(20)

    expect(host.textContent).toContain('loader:5')
    expect(host.getAttribute('data-fict-react-mounted')).toBe('1')

    host.setAttribute(
      'data-fict-react-props',
      encodePropsForAttribute({ label: 'loader', count: 6 }),
    )
    await tick(20)

    expect(host.textContent).toContain('loader:6')

    stop()
    expect(host.hasAttribute('data-fict-react-mounted')).toBe(false)
  })

  it('auto-disposes React roots when island hosts are removed from DOM', async () => {
    const fixtureModule = new URL('./fixtures/lifecycle-component.ts', import.meta.url).href
    const counters = globalThis as {
      __FICT_REACT_MOUNT_COUNT__?: number
      __FICT_REACT_UNMOUNT_COUNT__?: number
    }
    counters.__FICT_REACT_MOUNT_COUNT__ = 0
    counters.__FICT_REACT_UNMOUNT_COUNT__ = 0

    const host = document.createElement('div')
    host.setAttribute('data-fict-react', `${fixtureModule}#LifecycleComponent`)
    host.setAttribute('data-fict-react-client', 'load')
    host.setAttribute('data-fict-react-ssr', '0')
    host.setAttribute('data-fict-react-props', encodePropsForAttribute({ label: 'lifecycle' }))
    document.body.appendChild(host)

    const stop = installReactIslands()
    try {
      await waitForExpectation(() => {
        expect(counters.__FICT_REACT_MOUNT_COUNT__).toBe(1)
      })
      expect(counters.__FICT_REACT_UNMOUNT_COUNT__).toBe(0)

      host.remove()
      await waitForExpectation(() => {
        expect(counters.__FICT_REACT_UNMOUNT_COUNT__).toBe(1)
      })
    } finally {
      stop()
    }
  })

  it('rebuilds island runtime when qrl attribute changes', async () => {
    const moduleA = new URL('./fixtures/loader-component.ts', import.meta.url).href
    const moduleB = new URL('./fixtures/loader-component-alt.ts', import.meta.url).href
    const host = document.createElement('div')
    host.setAttribute('data-fict-react', `${moduleA}#LoaderComponent`)
    host.setAttribute('data-fict-react-client', 'load')
    host.setAttribute('data-fict-react-ssr', '0')
    host.setAttribute(
      'data-fict-react-props',
      encodePropsForAttribute({ label: 'switch', count: 1 }),
    )
    document.body.appendChild(host)

    const stop = installReactIslands()
    await tick(30)
    expect(host.textContent).toContain('switch:1')

    host.setAttribute('data-fict-react', `${moduleB}#LoaderComponentAlt`)
    await tick(30)
    expect(host.textContent).toContain('ALT-switch:1')

    stop()
  })

  it('loader executes action refs from serialized props', async () => {
    const componentModule = new URL('./fixtures/action-button-component.tsx', import.meta.url).href
    const actionModule = new URL('./fixtures/react-action-handler.ts', import.meta.url).href
    const actionHost = globalThis as { __FICT_REACT_ACTION_CALLS__?: string[] }
    actionHost.__FICT_REACT_ACTION_CALLS__ = []

    const host = document.createElement('div')
    host.setAttribute('data-fict-react', `${componentModule}#ActionButtonComponent`)
    host.setAttribute('data-fict-react-client', 'load')
    host.setAttribute('data-fict-react-ssr', '0')
    host.setAttribute(
      'data-fict-react-props',
      encodePropsForAttribute({
        label: 'loader',
        onAction: reactAction$(actionModule, 'recordReactAction'),
      }),
    )
    document.body.appendChild(host)

    const stop = installReactIslands()
    try {
      await tick(30)
      ;(host.querySelector('#action-button') as HTMLButtonElement).click()
      await waitForExpectation(() => {
        expect(actionHost.__FICT_REACT_ACTION_CALLS__).toEqual(['clicked:loader'])
      })
    } finally {
      stop()
    }
  })

  it('loader materializes configured non-onX action props from host attributes', async () => {
    const componentModule = new URL('./fixtures/custom-action-component.tsx', import.meta.url).href
    const actionModule = new URL('./fixtures/react-action-handler.ts', import.meta.url).href
    const actionHost = globalThis as { __FICT_REACT_ACTION_CALLS__?: string[] }
    actionHost.__FICT_REACT_ACTION_CALLS__ = []

    const host = document.createElement('div')
    host.setAttribute('data-fict-react', `${componentModule}#CustomActionComponent`)
    host.setAttribute('data-fict-react-client', 'load')
    host.setAttribute('data-fict-react-ssr', '0')
    host.setAttribute(
      'data-fict-react-action-props',
      encodeURIComponent(JSON.stringify(['submitAction'])),
    )
    host.setAttribute(
      'data-fict-react-props',
      encodePropsForAttribute({
        label: 'loader-option',
        submitAction: reactAction$(actionModule, 'recordReactAction'),
      }),
    )
    document.body.appendChild(host)

    const stop = installReactIslands()
    try {
      await tick(30)
      ;(host.querySelector('#custom-action-button') as HTMLButtonElement).click()
      await waitForExpectation(() => {
        expect(actionHost.__FICT_REACT_ACTION_CALLS__).toEqual(['custom:loader-option'])
      })
    } finally {
      stop()
    }
  })

  it('loader recovers from transient component load failures with bounded backoff retries', async () => {
    const fixtureModule = new URL('./fixtures/loader-component.ts', import.meta.url).href
    let attempts = 0

    __setLoaderComponentModuleLoaderForTests(async (resolvedUrl) => {
      attempts += 1
      if (attempts === 1) {
        throw new Error('transient-loader-failure')
      }

      return (await import(/* @vite-ignore */ resolvedUrl)) as Record<string, unknown>
    })

    const host = document.createElement('div')
    host.setAttribute('data-fict-react', `${fixtureModule}#LoaderComponent`)
    host.setAttribute('data-fict-react-client', 'load')
    host.setAttribute('data-fict-react-ssr', '0')
    host.setAttribute(
      'data-fict-react-props',
      encodePropsForAttribute({ label: 'retry-loader', count: 9 }),
    )
    document.body.appendChild(host)

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stop = installReactIslands()
    try {
      expect(host.textContent).not.toContain('retry-loader:9')

      await waitForExpectation(() => {
        expect(attempts).toBe(2)
      })
      await waitForExpectation(() => {
        expect(host.textContent).toContain('retry-loader:9')
      })
    } finally {
      stop()
      consoleSpy.mockRestore()
    }
  })

  it('loader mounts islands only after configured event strategy dispatch', async () => {
    const fixtureModule = new URL('./fixtures/loader-component.ts', import.meta.url).href
    const host = document.createElement('div')
    host.setAttribute('data-fict-react', `${fixtureModule}#LoaderComponent`)
    host.setAttribute('data-fict-react-client', 'event')
    host.setAttribute('data-fict-react-event', 'custom-ready')
    host.setAttribute('data-fict-react-ssr', '0')
    host.setAttribute(
      'data-fict-react-props',
      encodePropsForAttribute({ label: 'loader-event', count: 1 }),
    )
    document.body.appendChild(host)

    const stop = installReactIslands()
    try {
      await tick(30)
      expect(host.textContent).not.toContain('loader-event:1')
      expect(host.getAttribute('data-fict-react-mounted')).not.toBe('1')

      host.dispatchEvent(new Event('custom-ready'))
      await waitForExpectation(() => {
        expect(host.textContent).toContain('loader-event:1')
      })
      expect(host.getAttribute('data-fict-react-mounted')).toBe('1')
    } finally {
      stop()
    }
  })

  it('warns once per immutable host attribute mutation in dev runtime', async () => {
    const fixtureModule = new URL('./fixtures/loader-component.ts', import.meta.url).href
    const host = document.createElement('div')
    host.setAttribute('data-fict-react', `${fixtureModule}#LoaderComponent`)
    host.setAttribute('data-fict-react-client', 'load')
    host.setAttribute('data-fict-react-ssr', '0')
    host.setAttribute('data-fict-react-props', encodePropsForAttribute({ label: 'warn', count: 1 }))
    document.body.appendChild(host)

    const runtimeHost = globalThis as { __FICT_DEV__?: boolean }
    const originalDevFlag = runtimeHost.__FICT_DEV__
    runtimeHost.__FICT_DEV__ = true

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stop = installReactIslands()
    try {
      await tick(30)

      host.setAttribute('data-fict-react-client', 'idle')
      host.setAttribute('data-fict-react-client', 'visible')
      host.setAttribute('data-fict-react-ssr', '1')
      host.setAttribute('data-fict-react-prefix', 'changed')
      host.setAttribute('data-fict-react-prefix', 'changed-again')
      host.setAttribute('data-fict-react-event', 'hover')
      host.setAttribute('data-fict-react-event', 'click')
      await tick(30)

      expect(warnSpy).toHaveBeenCalledTimes(4)
    } finally {
      stop()
      warnSpy.mockRestore()
      runtimeHost.__FICT_DEV__ = originalDevFlag
    }
  })

  it('does not warn for immutable host attribute mutation in production runtime', async () => {
    const fixtureModule = new URL('./fixtures/loader-component.ts', import.meta.url).href
    const host = document.createElement('div')
    host.setAttribute('data-fict-react', `${fixtureModule}#LoaderComponent`)
    host.setAttribute('data-fict-react-client', 'load')
    host.setAttribute('data-fict-react-ssr', '0')
    host.setAttribute(
      'data-fict-react-props',
      encodePropsForAttribute({ label: 'silent', count: 2 }),
    )
    document.body.appendChild(host)

    const runtimeHost = globalThis as { __FICT_DEV__?: boolean }
    const originalDevFlag = runtimeHost.__FICT_DEV__
    runtimeHost.__FICT_DEV__ = false

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stop = installReactIslands()

    try {
      await tick(30)
      host.setAttribute('data-fict-react-client', 'idle')
      host.setAttribute('data-fict-react-ssr', '1')
      host.setAttribute('data-fict-react-prefix', 'prod')
      host.setAttribute('data-fict-react-event', 'prod-event')
      await tick(30)

      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      stop()
      warnSpy.mockRestore()
      runtimeHost.__FICT_DEV__ = originalDevFlag
    }
  })
})
