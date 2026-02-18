import { createEffect, onCleanup, onMount, type Component as FictComponent } from '@fictjs/runtime'
import { __fictIsSSR } from '@fictjs/runtime/internal'
import { createElement as createReactElement, type ComponentType } from 'react'
import { renderToString } from 'react-dom/server'

import { materializeReactProps } from './action'
import {
  DATA_FICT_REACT_CLIENT,
  DATA_FICT_REACT_HOST,
  DATA_FICT_REACT_MOUNTED,
  DATA_FICT_REACT_PREFIX,
  DATA_FICT_REACT_SSR,
  DEFAULT_CLIENT_DIRECTIVE,
} from './constants'
import { mountReactRoot, type MountedReactRoot } from './react-root'
import { scheduleByClientDirective } from './strategy'
import type { ReactIslandProps, ReactInteropOptions } from './types'

interface NormalizedReactInteropOptions {
  client: NonNullable<ReactInteropOptions['client']>
  ssr: boolean
  visibleRootMargin: string
  identifierPrefix: string
  actionProps: string[]
}

function normalizeOptions(options?: ReactInteropOptions): NormalizedReactInteropOptions {
  const client = options?.client ?? DEFAULT_CLIENT_DIRECTIVE
  const actionProps = Array.from(
    new Set((options?.actionProps ?? []).map(name => name.trim()).filter(Boolean)),
  )

  return {
    client,
    ssr: client === 'only' ? false : options?.ssr !== false,
    visibleRootMargin: options?.visibleRootMargin ?? '200px',
    identifierPrefix: options?.identifierPrefix ?? '',
    actionProps,
  }
}

function copyProps<P extends Record<string, unknown>>(props: P): P {
  const next: Record<string | symbol, unknown> = {}

  for (const key of Reflect.ownKeys(props)) {
    if (key === 'key') continue
    next[key] = props[key as keyof P]
  }

  return next as P
}

function resolveIslandProps<P extends Record<string, unknown>>(props: ReactIslandProps<P>): P {
  const source = props.props
  const resolved =
    typeof source === 'function'
      ? (source as () => P)()
      : ((source ?? {}) as Record<string, unknown>)

  const next = copyProps(resolved as P)

  if (!('children' in next) && props.children !== undefined) {
    ;(next as Record<string, unknown>).children = props.children
  }

  return next
}

interface ReactHostRuntime<P extends Record<string, unknown>> {
  component: ComponentType<P>
  readProps: () => P
  options: ReactInteropOptions
}

function createReactHost<P extends Record<string, unknown>>(runtime: ReactHostRuntime<P>) {
  const normalized = normalizeOptions(runtime.options)
  const isSSR = __fictIsSSR()

  let host: HTMLElement | null = null
  let root: MountedReactRoot | null = null
  let mountCleanup: (() => void) | null = null
  let latestProps = runtime.readProps()

  const hostProps: Record<string, unknown> = {
    ref: (el: Element | null) => {
      host = el as HTMLElement | null
    },
    [DATA_FICT_REACT_HOST]: '',
    [DATA_FICT_REACT_CLIENT]: normalized.client,
    [DATA_FICT_REACT_SSR]: normalized.ssr ? '1' : '0',
  }

  if (normalized.identifierPrefix) {
    hostProps[DATA_FICT_REACT_PREFIX] = normalized.identifierPrefix
  }

  if (isSSR && normalized.ssr) {
    const ssrNode = createReactElement(
      runtime.component,
      materializeReactProps(latestProps, normalized.actionProps),
    )
    hostProps.dangerouslySetInnerHTML = { __html: renderToString(ssrNode) }
  }

  if (!isSSR) {
    createEffect(() => {
      latestProps = runtime.readProps()
      if (root) {
        root.render(
          createReactElement(runtime.component, materializeReactProps(latestProps, normalized.actionProps)),
        )
      }
    })

    onMount(() => {
      if (__fictIsSSR()) return
      if (!host) return

      const mount = () => {
        if (!host || root) return
        const node = createReactElement(
          runtime.component,
          materializeReactProps(latestProps, normalized.actionProps),
        )
        const mountOptions = normalized.identifierPrefix
          ? {
              hydrate: normalized.ssr && normalized.client !== 'only',
              identifierPrefix: normalized.identifierPrefix,
            }
          : {
              hydrate: normalized.ssr && normalized.client !== 'only',
            }

        root = mountReactRoot(host, node, mountOptions)
        host.setAttribute(DATA_FICT_REACT_MOUNTED, '1')
      }

      mountCleanup = scheduleByClientDirective(normalized.client, host, mount, {
        visibleRootMargin: normalized.visibleRootMargin,
      })
    })

    onCleanup(() => {
      mountCleanup?.()
      mountCleanup = null
      root?.unmount()
      root = null

      if (host) {
        host.removeAttribute(DATA_FICT_REACT_MOUNTED)
      }
    })
  }

  return {
    type: 'div',
    props: hostProps,
  }
}

export function reactify<P extends Record<string, unknown>>(
  component: ComponentType<P>,
  options: ReactInteropOptions = {},
): FictComponent<P> {
  return function FictReactifiedComponent(rawProps: P) {
    return createReactHost({
      component,
      readProps: () => copyProps(rawProps),
      options,
    })
  }
}

export function ReactIsland<P extends Record<string, unknown>>(props: ReactIslandProps<P>) {
  const islandOptions: ReactInteropOptions = {}
  if (props.ssr !== undefined) {
    islandOptions.ssr = props.ssr
  }
  if (props.client !== undefined) {
    islandOptions.client = props.client
  }
  if (props.visibleRootMargin !== undefined) {
    islandOptions.visibleRootMargin = props.visibleRootMargin
  }
  if (props.identifierPrefix !== undefined) {
    islandOptions.identifierPrefix = props.identifierPrefix
  }
  if (props.actionProps !== undefined) {
    islandOptions.actionProps = props.actionProps
  }

  return createReactHost({
    component: props.component,
    readProps: () => resolveIslandProps(props),
    options: islandOptions,
  })
}
