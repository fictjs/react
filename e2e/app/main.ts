import { prop, render } from '@fictjs/runtime'
import { createSignal } from '@fictjs/runtime/advanced'
import React from 'react'

import { installReactIslands, reactify, reactify$ } from '../../src/index'

const RemoteIsland = reactify$<{ label: string; count: number }>({
  module: new URL('./remote-widget.tsx', import.meta.url).href,
  export: 'RemoteWidget',
  ssr: false,
  client: 'load',
})

const Eager = reactify(({ count }: { count: number }) => {
  return React.createElement('div', { 'data-testid': 'eager-value' }, `eager:${count}`)
})

function App() {
  const eagerCount = createSignal(0)
  const qrlCount = createSignal(0)

  return {
    type: 'div',
    props: {
      children: [
        {
          type: 'button',
          props: {
            id: 'eager-inc',
            onClick: () => eagerCount(eagerCount() + 1),
            children: 'inc eager',
          },
        },
        {
          type: Eager,
          props: {
            count: prop(() => eagerCount()),
          },
        },
        {
          type: 'button',
          props: {
            id: 'qrl-inc',
            onClick: () => qrlCount(qrlCount() + 1),
            children: 'inc qrl',
          },
        },
        {
          type: RemoteIsland,
          props: {
            label: 'qrl',
            count: prop(() => qrlCount()),
          },
        },
      ],
    },
  }
}

const app = document.getElementById('app') as HTMLElement
render(() => ({ type: App, props: {} }), app)

const loaderHost = document.getElementById('loader-island') as HTMLElement
const loaderQrl = `${new URL('./remote-widget.tsx', import.meta.url).href}#LoaderWidget`
let loaderCount = 1

const encode = (value: Record<string, unknown>) => encodeURIComponent(JSON.stringify(value))

loaderHost.setAttribute('data-fict-react', loaderQrl)
loaderHost.setAttribute('data-fict-react-client', 'load')
loaderHost.setAttribute('data-fict-react-ssr', '0')
loaderHost.setAttribute('data-fict-react-props', encode({ label: 'loader', count: loaderCount }))

const button = document.createElement('button')
button.id = 'loader-inc'
button.textContent = 'inc loader'
button.addEventListener('click', () => {
  loaderCount += 1
  loaderHost.setAttribute('data-fict-react-props', encode({ label: 'loader', count: loaderCount }))
})
document.body.appendChild(button)

const immutableMutationButton = document.createElement('button')
immutableMutationButton.id = 'loader-mutate-immutable'
immutableMutationButton.textContent = 'mutate loader immutable attrs'
immutableMutationButton.addEventListener('click', () => {
  loaderHost.setAttribute('data-fict-react-client', 'idle')
  loaderHost.setAttribute('data-fict-react-ssr', '1')
  loaderHost.setAttribute('data-fict-react-prefix', 'mutated-prefix')
})
document.body.appendChild(immutableMutationButton)

installReactIslands()
