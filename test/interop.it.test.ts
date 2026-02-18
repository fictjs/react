import { render } from '@fictjs/runtime'
import { createSignal } from '@fictjs/runtime/advanced'
import { __fictDisableSSR, __fictEnableSSR } from '@fictjs/runtime/internal'
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

    await tick(20)
    expect(shellHost.textContent).toContain('it:3')

    shellHost.setAttribute('data-fict-react-props', encodePropsForAttribute({ label: 'it', count: 4 }))
    await tick(20)
    expect(shellHost.textContent).toContain('it:4')

    stop()
  })
})
