import { prop, render } from '@fictjs/runtime'
import { createSignal } from '@fictjs/runtime/advanced'
import { __fictDisableSSR, __fictEnableSSR } from '@fictjs/runtime/internal'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { installReactIslands, reactAction$, reactify$ } from '../src'
import {
  __resetResumableComponentModuleLoaderForTests,
  __setResumableComponentModuleLoaderForTests,
} from '../src/resumable'
import { encodePropsForAttribute } from '../src/serialization'

const tick = async (ms = 0) => {
  await new Promise(resolve => setTimeout(resolve, ms))
}

afterEach(() => {
  document.body.innerHTML = ''
  __fictDisableSSR()
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
    await tick(30)

    ;(container.querySelector('#action-button') as HTMLButtonElement).click()
    await tick(30)

    expect(actionHost.__FICT_REACT_ACTION_CALLS__).toEqual(['clicked:run'])

    dispose()
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
    await tick(30)

    ;(container.querySelector('#custom-action-button') as HTMLButtonElement).click()
    await tick(30)

    expect(actionHost.__FICT_REACT_ACTION_CALLS__).toEqual(['custom:option'])

    dispose()
  })

  it('recovers from transient component load failures with bounded backoff retries', async () => {
    const fixtureModule = new URL('./fixtures/loader-component.ts', import.meta.url).href
    let attempts = 0

    __setResumableComponentModuleLoaderForTests(async resolvedUrl => {
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
    await tick(20)
    expect(container.textContent).not.toContain('retry:7')

    await tick(140)
    expect(attempts).toBe(2)
    expect(container.textContent).toContain('retry:7')

    dispose()
    consoleSpy.mockRestore()
  })
})

describe('installReactIslands', () => {
  it('hydrates/mounts hosts and re-renders on serialized props updates', async () => {
    const fixtureModule = new URL('./fixtures/loader-component.ts', import.meta.url).href
    const host = document.createElement('div')
    host.setAttribute('data-fict-react', `${fixtureModule}#LoaderComponent`)
    host.setAttribute('data-fict-react-client', 'load')
    host.setAttribute('data-fict-react-ssr', '0')
    host.setAttribute('data-fict-react-props', encodePropsForAttribute({ label: 'loader', count: 5 }))

    document.body.appendChild(host)

    const stop = installReactIslands()
    await tick(20)

    expect(host.textContent).toContain('loader:5')
    expect(host.getAttribute('data-fict-react-mounted')).toBe('1')

    host.setAttribute('data-fict-react-props', encodePropsForAttribute({ label: 'loader', count: 6 }))
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
    await tick(30)

    expect(counters.__FICT_REACT_MOUNT_COUNT__).toBe(1)
    expect(counters.__FICT_REACT_UNMOUNT_COUNT__).toBe(0)

    host.remove()
    await tick(30)

    expect(counters.__FICT_REACT_UNMOUNT_COUNT__).toBe(1)

    stop()
  })

  it('rebuilds island runtime when qrl attribute changes', async () => {
    const moduleA = new URL('./fixtures/loader-component.ts', import.meta.url).href
    const moduleB = new URL('./fixtures/loader-component-alt.ts', import.meta.url).href
    const host = document.createElement('div')
    host.setAttribute('data-fict-react', `${moduleA}#LoaderComponent`)
    host.setAttribute('data-fict-react-client', 'load')
    host.setAttribute('data-fict-react-ssr', '0')
    host.setAttribute('data-fict-react-props', encodePropsForAttribute({ label: 'switch', count: 1 }))
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
    await tick(30)

    ;(host.querySelector('#action-button') as HTMLButtonElement).click()
    await tick(30)

    expect(actionHost.__FICT_REACT_ACTION_CALLS__).toEqual(['clicked:loader'])

    stop()
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
    host.setAttribute('data-fict-react-action-props', encodeURIComponent(JSON.stringify(['submitAction'])))
    host.setAttribute(
      'data-fict-react-props',
      encodePropsForAttribute({
        label: 'loader-option',
        submitAction: reactAction$(actionModule, 'recordReactAction'),
      }),
    )
    document.body.appendChild(host)

    const stop = installReactIslands()
    await tick(30)

    ;(host.querySelector('#custom-action-button') as HTMLButtonElement).click()
    await tick(30)

    expect(actionHost.__FICT_REACT_ACTION_CALLS__).toEqual(['custom:loader-option'])

    stop()
  })
})
