import { prop, render } from '@fictjs/runtime'
import { createSignal } from '@fictjs/runtime/advanced'
import React from 'react'

import {
  ReactIsland,
  installReactIslands,
  reactAction$,
  reactify,
  reactify$,
} from '../../src/index'

interface E2EState {
  lifecycleMounts: number
  lifecycleUnmounts: number
  actionCalls: string[]
}

const globalHost = globalThis as typeof globalThis & {
  __FICT_E2E__?: E2EState
}

function ensureE2EState(): E2EState {
  if (!globalHost.__FICT_E2E__) {
    globalHost.__FICT_E2E__ = {
      lifecycleMounts: 0,
      lifecycleUnmounts: 0,
      actionCalls: [],
    }
  }

  return globalHost.__FICT_E2E__
}

const e2eState = ensureE2EState()
e2eState.lifecycleMounts = 0
e2eState.lifecycleUnmounts = 0
e2eState.actionCalls = []

const remoteModuleUrl = new URL('./remote-widget.tsx', import.meta.url).href

let actionCallSignal: ((value?: number) => number) | null = null

export function recordE2EAction(payload: string) {
  const state = ensureE2EState()
  state.actionCalls.push(payload)

  if (actionCallSignal) {
    const current = actionCallSignal()
    actionCallSignal(current + 1)
  }
}

const RemoteIsland = reactify$<{ label: string; count: number }>({
  module: remoteModuleUrl,
  export: 'RemoteWidget',
  ssr: false,
  client: 'load',
})

const ActionIsland = reactify$<{ label: string; onAction: ReturnType<typeof reactAction$> }>({
  module: remoteModuleUrl,
  export: 'ActionWidget',
  ssr: false,
  client: 'load',
})

const Eager = reactify(({ count }: { count: number }) => {
  return React.createElement('div', { 'data-testid': 'eager-value' }, `eager:${count}`)
})

function StrategyView(props: { testId: string; label: string }) {
  return React.createElement('div', { 'data-testid': props.testId }, props.label)
}

function ReactIslandLabel(props: { label: string }) {
  return React.createElement('div', { 'data-testid': 'react-island-value' }, props.label)
}

const HoverStrategyIsland = reactify(StrategyView, {
  client: 'hover',
  tagName: 'button',
})

const EventStrategyIsland = reactify(StrategyView, {
  client: 'event',
  event: 'dblclick',
  tagName: 'button',
})

const VisibleStrategyIsland = reactify(StrategyView, {
  client: 'visible',
  visibleRootMargin: '0px',
})

function App() {
  const eagerCount = createSignal(0)
  const qrlCount = createSignal(0)
  const islandLabel = createSignal('alpha')
  const signalMountGate = createSignal(false)
  const actionCount = createSignal(0)

  actionCallSignal = actionCount

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
        {
          type: 'button',
          props: {
            id: 'react-island-swap',
            onClick: () => islandLabel(islandLabel() === 'alpha' ? 'beta' : 'alpha'),
            children: 'swap react island',
          },
        },
        {
          type: ReactIsland,
          props: {
            component: ReactIslandLabel,
            props: () => ({
              label: islandLabel(),
            }),
          },
        },
        {
          type: 'button',
          props: {
            id: 'signal-mount',
            onClick: () => signalMountGate(true),
            children: 'mount signal strategy',
          },
        },
        {
          type: ReactIsland,
          props: {
            component: StrategyView,
            client: 'signal',
            signal: () => signalMountGate(),
            props: {
              testId: 'signal-strategy-value',
              label: 'signal-mounted',
            },
          },
        },
        {
          type: ActionIsland,
          props: {
            label: 'main',
            onAction: reactAction$(import.meta.url, 'recordE2EAction'),
          },
        },
        {
          type: 'div',
          props: {
            'data-testid': 'action-call-count',
            children: prop(() => String(actionCount())),
          },
        },
      ],
    },
  }
}

const app = document.getElementById('app') as HTMLElement
render(() => ({ type: App, props: {} }), app)

const hoverRoot = document.createElement('div')
hoverRoot.id = 'hover-root'
document.body.appendChild(hoverRoot)
render(
  () => ({
    type: HoverStrategyIsland,
    props: {
      testId: 'hover-strategy-value',
      label: 'hover-mounted',
    },
  }),
  hoverRoot,
)

const eventRoot = document.createElement('div')
eventRoot.id = 'event-root'
document.body.appendChild(eventRoot)
render(
  () => ({
    type: EventStrategyIsland,
    props: {
      testId: 'event-strategy-value',
      label: 'event-mounted',
    },
  }),
  eventRoot,
)

const visibleRoot = document.createElement('div')
visibleRoot.id = 'visible-root'
visibleRoot.style.marginTop = '2200px'
visibleRoot.style.minHeight = '20px'
document.body.appendChild(visibleRoot)
render(
  () => ({
    type: VisibleStrategyIsland,
    props: {
      testId: 'visible-strategy-value',
      label: 'visible-mounted',
    },
  }),
  visibleRoot,
)

const encode = (value: Record<string, unknown>) => encodeURIComponent(JSON.stringify(value))

function appendControlButton(id: string, text: string, onClick: () => void) {
  const button = document.createElement('button')
  button.id = id
  button.textContent = text
  button.addEventListener('click', onClick)
  document.body.appendChild(button)
}

const loaderHost = document.getElementById('loader-island') as HTMLElement
const loaderQrl = `${remoteModuleUrl}#LoaderWidget`
const loaderAltQrl = `${remoteModuleUrl}#LoaderWidgetAlt`
const loaderLifecycleQrl = `${remoteModuleUrl}#LifecycleWidget`
let loaderCount = 1
let dynamicLoaderHost: HTMLElement | null = null

loaderHost.setAttribute('data-fict-react', loaderQrl)
loaderHost.setAttribute('data-fict-react-client', 'load')
loaderHost.setAttribute('data-fict-react-ssr', '0')
loaderHost.setAttribute('data-fict-react-props', encode({ label: 'loader', count: loaderCount }))

appendControlButton('loader-inc', 'inc loader', () => {
  loaderCount += 1
  loaderHost.setAttribute('data-fict-react-props', encode({ label: 'loader', count: loaderCount }))
})

appendControlButton('loader-switch-qrl', 'switch loader qrl', () => {
  loaderHost.setAttribute('data-fict-react', loaderAltQrl)
  loaderHost.setAttribute('data-fict-react-props', encode({ label: 'loader', count: loaderCount }))
})

appendControlButton('loader-add-dynamic', 'add dynamic loader host', () => {
  if (dynamicLoaderHost?.isConnected) return

  dynamicLoaderHost = document.createElement('div')
  dynamicLoaderHost.id = 'loader-dynamic-host'
  dynamicLoaderHost.setAttribute('data-fict-react', loaderLifecycleQrl)
  dynamicLoaderHost.setAttribute('data-fict-react-client', 'load')
  dynamicLoaderHost.setAttribute('data-fict-react-ssr', '0')
  dynamicLoaderHost.setAttribute('data-fict-react-props', encode({ label: 'dynamic' }))
  document.body.appendChild(dynamicLoaderHost)
})

appendControlButton('loader-remove-dynamic', 'remove dynamic loader host', () => {
  if (!dynamicLoaderHost) return
  dynamicLoaderHost.remove()
  dynamicLoaderHost = null
})

appendControlButton('loader-mutate-immutable', 'mutate loader immutable attrs', () => {
  loaderHost.setAttribute('data-fict-react-client', 'idle')
  loaderHost.setAttribute('data-fict-react-ssr', '1')
  loaderHost.setAttribute('data-fict-react-prefix', 'mutated-prefix')
})

installReactIslands()
