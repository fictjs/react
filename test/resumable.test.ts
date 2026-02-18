import { prop, render } from '@fictjs/runtime'
import { createSignal } from '@fictjs/runtime/advanced'
import { __fictDisableSSR, __fictEnableSSR } from '@fictjs/runtime/internal'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { installReactIslands, reactify$ } from '../src'
import { encodePropsForAttribute } from '../src/serialization'

const tick = async (ms = 0) => {
  await new Promise(resolve => setTimeout(resolve, ms))
}

afterEach(() => {
  document.body.innerHTML = ''
  __fictDisableSSR()
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
})
