import { render } from '@fictjs/runtime'
import { createSignal } from '@fictjs/runtime/advanced'
import { __fictDisableSSR, __fictEnableSSR } from '@fictjs/runtime/internal'
import React, { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { installReactIslands, reactify, reactify$ } from '../src'
import { encodePropsForAttribute } from '../src/serialization'

const tick = async (ms = 0) => {
  await new Promise((resolve) => setTimeout(resolve, ms))
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
  document.body.innerHTML = ''
  __fictDisableSSR()
})

describe('interop IT', () => {
  it('connects SSR host + client loader + serialized prop updates', async () => {
    const fixtureModule = new URL('./fixtures/loader-component.ts', import.meta.url).href

    const Island = reactify$<{ label: string; count: number }>({
      module: fixtureModule,
      export: 'LoaderComponent',
      ssr: false,
      client: 'load',
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
              type: Island,
              props: {
                label: 'it',
                count: () => count(),
              },
            },
          ],
        },
      }
    }

    const container = document.createElement('div')
    document.body.appendChild(container)

    __fictEnableSSR()
    const disposeSSR = render(() => ({ type: App, props: {} }), container)
    __fictDisableSSR()

    const host = container.querySelector('[data-fict-react]') as HTMLElement | null
    expect(host).not.toBeNull()
    expect(host?.getAttribute('data-fict-react-props')).toBeTruthy()

    disposeSSR()

    // Simulate server HTML arriving on client: keep only host + attrs
    const clientContainer = document.createElement('div')
    clientContainer.innerHTML = `<div id="ssr-shell" data-fict-react="${host?.getAttribute('data-fict-react')}" data-fict-react-client="load" data-fict-react-ssr="0" data-fict-react-props="${encodePropsForAttribute({ label: 'it', count: 3 })}"></div>`
    document.body.appendChild(clientContainer)

    const shellHost = clientContainer.querySelector('#ssr-shell') as HTMLElement
    const stop = installReactIslands({ document })

    await waitForExpectation(() => {
      expect(shellHost.textContent).toContain('it:3')
    })

    shellHost.setAttribute(
      'data-fict-react-props',
      encodePropsForAttribute({ label: 'it', count: 4 }),
    )
    await waitForExpectation(() => {
      expect(shellHost.textContent).toContain('it:4')
    })

    stop()
  })

  it('hydrates SSR host through runtime reactify path and reuses existing DOM nodes', async () => {
    const RuntimeHydrationIsland = reactify(({ initial }: { initial: number }) => {
      const [count, setCount] = useState(initial)

      return React.createElement(
        'button',
        {
          id: 'runtime-hydration-button',
          onClick: () => setCount((value) => value + 1),
        },
        `runtime:${count}`,
      )
    })

    function App() {
      return {
        type: RuntimeHydrationIsland,
        props: {
          initial: 2,
        },
      }
    }

    const ssrContainer = document.createElement('div')
    document.body.appendChild(ssrContainer)

    __fictEnableSSR()
    const disposeSSR = render(() => ({ type: App, props: {} }), ssrContainer)
    __fictDisableSSR()

    const ssrHost = ssrContainer.querySelector('[data-fict-react-host]') as HTMLElement | null
    expect(ssrHost).not.toBeNull()
    expect(ssrHost?.getAttribute('data-fict-react-ssr')).toBe('1')
    expect(ssrHost?.innerHTML).toContain('runtime:2')
    const ssrHostInnerHtml = ssrHost?.innerHTML ?? ''
    disposeSSR()

    const clientContainer = document.createElement('div')
    document.body.appendChild(clientContainer)

    const disposeClient = render(() => ({ type: App, props: {} }), clientContainer)
    const clientHost = clientContainer.querySelector('[data-fict-react-host]') as HTMLElement | null
    expect(clientHost).not.toBeNull()
    expect(clientHost?.getAttribute('data-fict-react-ssr')).toBe('1')

    // Fill the runtime host with server-rendered HTML before load-strategy mount runs.
    clientHost!.innerHTML = ssrHostInnerHtml

    const preHydrationButton = clientHost!.querySelector(
      '#runtime-hydration-button',
    ) as HTMLButtonElement | null
    expect(preHydrationButton).not.toBeNull()

    let nativeClicks = 0
    preHydrationButton!.addEventListener('click', () => {
      nativeClicks += 1
    })

    await waitForExpectation(() => {
      expect(clientHost?.getAttribute('data-fict-react-mounted')).toBe('1')
    })

    const hydratedButton = clientHost!.querySelector(
      '#runtime-hydration-button',
    ) as HTMLButtonElement | null
    expect(hydratedButton).toBe(preHydrationButton)

    hydratedButton?.click()
    await waitForExpectation(() => {
      expect(hydratedButton?.textContent).toBe('runtime:3')
    })

    expect(nativeClicks).toBe(1)

    disposeClient()
  })
})
