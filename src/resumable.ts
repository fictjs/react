import { createEffect, onCleanup, onMount, type Component as FictComponent } from '@fictjs/runtime'
import { __fictIsSSR, __fictQrl } from '@fictjs/runtime/internal'
import { createElement as createReactElement, type ComponentType } from 'react'
import { renderToString } from 'react-dom/server'

import { materializeReactProps } from './action'
import { loadResumableComponentModule } from './component-module-loader'
import {
  DATA_FICT_REACT_ACTION_PROPS,
  DATA_FICT_REACT_CLIENT,
  DATA_FICT_REACT_EVENT,
  DATA_FICT_REACT_HOST,
  DATA_FICT_REACT_MOUNTED,
  DATA_FICT_REACT_PREFIX,
  DATA_FICT_REACT_PROPS,
  DATA_FICT_REACT_QRL,
  DATA_FICT_REACT_SSR,
  DEFAULT_CLIENT_DIRECTIVE,
} from './constants'
import { normalizeMountEvents } from './mount-events'
import { parseQrl, resolveModuleUrl } from './qrl'
import { mountReactRoot, type MountedReactRoot } from './react-root'
import { encodePropsForAttribute } from './serialization'
import { scheduleByClientDirective } from './strategy'
import type { ReactInteropOptions, ReactifyQrlOptions } from './types'

const COMPONENT_LOAD_RETRY_BASE_DELAY_MS = 100
const COMPONENT_LOAD_RETRY_MAX_DELAY_MS = 5_000
const COMPONENT_LOAD_RETRY_MAX_FAILURES = 5

interface NormalizedReactInteropOptions {
  client: NonNullable<ReactInteropOptions['client']>
  ssr: boolean
  events: string[]
  visibleRootMargin: string
  identifierPrefix: string
  tagName: string
  actionProps: string[]
}

type ReactComponentModule = Record<string, unknown>

function normalizeHostTagName(tagName: string | undefined): string {
  const normalized = tagName?.trim()
  return normalized && normalized.length > 0 ? normalized : 'div'
}

function normalizeOptions(options?: ReactInteropOptions): NormalizedReactInteropOptions {
  const client = options?.client ?? DEFAULT_CLIENT_DIRECTIVE
  const actionProps = Array.from(
    new Set((options?.actionProps ?? []).map((name) => name.trim()).filter(Boolean)),
  )
  const events = normalizeMountEvents(options?.event)

  return {
    client,
    ssr: client === 'only' ? false : options?.ssr !== false,
    events,
    visibleRootMargin: options?.visibleRootMargin ?? '200px',
    identifierPrefix: options?.identifierPrefix ?? '',
    tagName: normalizeHostTagName(options?.tagName),
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

async function loadComponentFromQrl<P extends Record<string, unknown>>(
  qrl: string,
): Promise<ComponentType<P>> {
  const { url, exportName } = parseQrl(qrl)
  if (!url) {
    throw new Error('[fict/react] React island QRL is missing module URL.')
  }

  const resolvedUrl = resolveModuleUrl(url)
  const mod = (await loadResumableComponentModule(resolvedUrl)) as ReactComponentModule

  const candidate = (mod[exportName] ?? mod.default) as unknown
  if (typeof candidate !== 'function') {
    throw new Error(
      `[fict/react] Export "${exportName}" from "${resolvedUrl}" is not a React component.`,
    )
  }

  return candidate as ComponentType<P>
}

function retryDelayMs(failures: number): number {
  return Math.min(
    COMPONENT_LOAD_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, failures - 1),
    COMPONENT_LOAD_RETRY_MAX_DELAY_MS,
  )
}

export function createReactQrl(moduleId: string, exportName = 'default'): string {
  return __fictQrl(moduleId, exportName)
}

export function reactify$<P extends Record<string, unknown>>(
  options: ReactifyQrlOptions<P>,
): FictComponent<P> {
  const exportName = options.export ?? 'default'

  return function FictReactResumableComponent(rawProps: P) {
    const normalized = normalizeOptions(options)
    const isSSR = __fictIsSSR()
    const qrl = __fictQrl(options.module, exportName)

    let host: HTMLElement | null = null
    let root: MountedReactRoot | null = null
    let mountCleanup: (() => void) | null = null
    let active = true

    let resolvedComponent: ComponentType<P> | null = options.component ?? null
    let loadPromise: Promise<ComponentType<P>> | null = null
    let loadFailures = 0
    let nextLoadRetryAt = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let latestProps = copyProps(rawProps)

    const clearRetryTimer = () => {
      if (retryTimer === null) return
      clearTimeout(retryTimer)
      retryTimer = null
    }

    const ensureComponent = async (): Promise<ComponentType<P>> => {
      const now = Date.now()
      if (nextLoadRetryAt > now) {
        const waitMs = nextLoadRetryAt - now
        throw new Error(`[fict/react] React island load cooldown active; retry in ${waitMs}ms.`)
      }

      if (resolvedComponent) {
        return resolvedComponent
      }
      if (loadPromise) {
        return loadPromise
      }

      loadPromise = loadComponentFromQrl<P>(qrl)
        .then((component) => {
          resolvedComponent = component
          loadFailures = 0
          nextLoadRetryAt = 0
          loadPromise = null
          return component
        })
        .catch((error) => {
          loadPromise = null
          loadFailures += 1
          nextLoadRetryAt = Date.now() + retryDelayMs(loadFailures)
          throw error
        })

      return loadPromise
    }

    const syncSerializedPropsToHost = () => {
      if (!host) return
      host.setAttribute(DATA_FICT_REACT_PROPS, encodePropsForAttribute(latestProps))
    }

    const hostProps: Record<string, unknown> = {
      ref: (el: Element | null) => {
        host = el as HTMLElement | null
      },
      [DATA_FICT_REACT_HOST]: '',
      [DATA_FICT_REACT_QRL]: qrl,
      [DATA_FICT_REACT_CLIENT]: normalized.client,
      [DATA_FICT_REACT_SSR]: normalized.ssr ? '1' : '0',
      [DATA_FICT_REACT_PROPS]: encodePropsForAttribute(latestProps),
    }

    if (normalized.identifierPrefix) {
      hostProps[DATA_FICT_REACT_PREFIX] = normalized.identifierPrefix
    }
    if (normalized.actionProps.length > 0) {
      hostProps[DATA_FICT_REACT_ACTION_PROPS] = encodeURIComponent(
        JSON.stringify(normalized.actionProps),
      )
    }
    if (normalized.events.length > 0) {
      hostProps[DATA_FICT_REACT_EVENT] = normalized.events.join(',')
    }

    if (isSSR && normalized.ssr && resolvedComponent) {
      const ssrNode = createReactElement(
        resolvedComponent,
        materializeReactProps(latestProps, normalized.actionProps),
      )
      hostProps.dangerouslySetInnerHTML = { __html: renderToString(ssrNode) }
    }

    if (!isSSR) {
      createEffect(() => {
        latestProps = copyProps(rawProps)
        syncSerializedPropsToHost()

        if (root && resolvedComponent) {
          root.render(
            createReactElement(
              resolvedComponent,
              materializeReactProps(latestProps, normalized.actionProps),
            ),
          )
        }
      })

      onMount(() => {
        if (__fictIsSSR()) return
        if (!host) return

        const scheduleRetry = (mount: () => void) => {
          if (!host || !active || root) return
          if (loadFailures >= COMPONENT_LOAD_RETRY_MAX_FAILURES) return

          const waitMs = Math.max(0, nextLoadRetryAt - Date.now())
          clearRetryTimer()
          retryTimer = setTimeout(mount, waitMs)
        }

        const mount = () => {
          void (async () => {
            if (!host || !active || root) return

            let component: ComponentType<P>
            try {
              component = await ensureComponent()
            } catch (error) {
              if (typeof console !== 'undefined' && typeof console.error === 'function') {
                console.error(
                  '[fict/react] Failed to load resumable React island component.',
                  error,
                )
              }
              scheduleRetry(mount)
              return
            }
            if (!host || !active || root) return

            const node = createReactElement(
              component,
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
            clearRetryTimer()
          })().catch((error) => {
            if (typeof console !== 'undefined' && typeof console.error === 'function') {
              console.error('[fict/react] Failed to mount resumable React island.', error)
            }
          })
        }

        mountCleanup = scheduleByClientDirective(normalized.client, host, mount, {
          events: normalized.events,
          visibleRootMargin: normalized.visibleRootMargin,
        })
      })

      onCleanup(() => {
        active = false
        mountCleanup?.()
        mountCleanup = null
        clearRetryTimer()
        root?.unmount()
        root = null

        if (host) {
          host.removeAttribute(DATA_FICT_REACT_MOUNTED)
        }
      })
    }

    return {
      type: normalized.tagName,
      props: hostProps,
    }
  }
}
