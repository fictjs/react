import { prop, render } from '@fictjs/runtime'
import { createSignal } from '@fictjs/runtime/advanced'
import { __fictDisableSSR, __fictEnableSSR } from '@fictjs/runtime/internal'
import React, { useEffect, useRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { ReactIsland, reactify } from '../src'

const tick = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
  document.body.innerHTML = ''
  __fictDisableSSR()
})

describe('reactify', () => {
  it('mounts a React component and updates props reactively', async () => {
    const ReactCounter = reactify(({ value }: { value: number }) => {
      return React.createElement('span', { id: 'react-count' }, String(value))
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
                id: 'inc',
                onClick: () => count(count() + 1),
                children: 'inc',
              },
            },
            {
              type: ReactCounter,
              props: {
                value: prop(() => count()),
              },
            },
          ],
        },
      }
    }

    const container = document.createElement('div')
    document.body.appendChild(container)

    const dispose = render(() => ({ type: App, props: {} }), container)
    await tick()

    expect(container.querySelector('#react-count')?.textContent).toBe('1')
    ;(container.querySelector('#inc') as HTMLButtonElement).click()
    await tick()

    expect(container.querySelector('#react-count')?.textContent).toBe('2')

    dispose()
  })

  it('unmounts React root when island is removed', async () => {
    let unmounts = 0

    const Tracked = reactify(() => {
      useEffect(() => {
        return () => {
          unmounts += 1
        }
      }, [])

      return React.createElement('div', { id: 'tracked' }, 'tracked')
    })

    function App() {
      const show = createSignal(true)

      return {
        type: 'div',
        props: {
          children: [
            {
              type: 'button',
              props: {
                id: 'toggle',
                onClick: () => show(!show()),
                children: 'toggle',
              },
            },
            () => (show() ? { type: Tracked, props: {} } : null),
          ],
        },
      }
    }

    const container = document.createElement('div')
    document.body.appendChild(container)

    const dispose = render(() => ({ type: App, props: {} }), container)
    await tick()

    expect(container.querySelector('#tracked')).not.toBeNull()
    ;(container.querySelector('#toggle') as HTMLButtonElement).click()
    await tick()

    expect(container.querySelector('#tracked')).toBeNull()
    expect(unmounts).toBe(1)

    dispose()
  })

  it('renders SSR markup and avoids mount side-effects in SSR mode', () => {
    const SSRAware = reactify(({ text }: { text: string }) => {
      return React.createElement('strong', null, text)
    })

    const container = document.createElement('div')
    document.body.appendChild(container)

    __fictEnableSSR()
    const dispose = render(() => ({ type: SSRAware, props: { text: 'server' } }), container)
    __fictDisableSSR()

    const host = container.querySelector('[data-fict-react-host]') as HTMLElement | null
    expect(host).not.toBeNull()
    expect(host?.getAttribute('data-fict-react-ssr')).toBe('1')
    expect(host?.hasAttribute('data-fict-react-mounted')).toBe(false)
    expect(host?.innerHTML).toContain('<strong>server</strong>')

    dispose()
  })

  it('preserves non-callback object prop identity across rerenders', async () => {
    let dataDependencyRuns = 0
    const stableData = { version: 1 }

    const IdentityProbe = reactify(
      ({ value, data }: { value: number; data: { version: number } }) => {
        const prevDataRef = useRef<{ version: number } | null>(null)
        if (prevDataRef.current !== data) {
          dataDependencyRuns += 1
          prevDataRef.current = data
        }

        return React.createElement('span', { id: 'identity-value' }, String(value))
      },
    )

    function App() {
      const value = createSignal(0)

      return {
        type: 'div',
        props: {
          children: [
            {
              type: 'button',
              props: {
                id: 'identity-inc',
                onClick: () => value(value() + 1),
                children: 'identity-inc',
              },
            },
            {
              type: IdentityProbe,
              props: {
                value: prop(() => value()),
                data: stableData,
              },
            },
          ],
        },
      }
    }

    const container = document.createElement('div')
    document.body.appendChild(container)

    const dispose = render(() => ({ type: App, props: {} }), container)
    await tick()
    expect(dataDependencyRuns).toBe(1)
    ;(container.querySelector('#identity-inc') as HTMLButtonElement).click()
    await tick()

    expect(dataDependencyRuns).toBe(1)
    expect(container.querySelector('#identity-value')?.textContent).toBe('1')

    dispose()
  })

  it('supports event strategy with custom mount events', async () => {
    const EventIsland = reactify(
      ({ value }: { value: number }) =>
        React.createElement('span', { id: 'event-value' }, String(value)),
      {
        client: 'event',
        event: ['custom-ready'],
        ssr: false,
      },
    )

    const container = document.createElement('div')
    document.body.appendChild(container)

    const dispose = render(() => ({ type: EventIsland, props: { value: 3 } }), container)
    await tick()

    const host = container.querySelector('[data-fict-react-host]') as HTMLElement | null
    expect(host).not.toBeNull()
    expect(host?.getAttribute('data-fict-react-client')).toBe('event')
    expect(host?.getAttribute('data-fict-react-event')).toBe('custom-ready')
    expect(container.querySelector('#event-value')).toBeNull()

    host?.dispatchEvent(new Event('custom-ready'))
    await tick()

    expect(container.querySelector('#event-value')?.textContent).toBe('3')

    dispose()
  })
})

describe('ReactIsland', () => {
  it('supports explicit props getter API', async () => {
    function Label(props: { text: string }) {
      return React.createElement('p', { id: 'island-label' }, props.text)
    }

    function App() {
      const text = createSignal('alpha')

      return {
        type: 'div',
        props: {
          children: [
            {
              type: 'button',
              props: {
                id: 'swap',
                onClick: () => text('beta'),
                children: 'swap',
              },
            },
            {
              type: ReactIsland,
              props: {
                component: Label,
                props: () => ({ text: text() }),
              },
            },
          ],
        },
      }
    }

    const container = document.createElement('div')
    document.body.appendChild(container)

    const dispose = render(() => ({ type: App, props: {} }), container)
    await tick()

    expect(container.querySelector('#island-label')?.textContent).toBe('alpha')
    ;(container.querySelector('#swap') as HTMLButtonElement).click()
    await tick()

    expect(container.querySelector('#island-label')?.textContent).toBe('beta')

    dispose()
  })
})
