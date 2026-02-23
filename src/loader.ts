import { createElement as createReactElement, type ComponentType } from 'react'

import { materializeReactProps } from './action'
import { loadLoaderComponentModule } from './component-module-loader'
import {
  DATA_FICT_REACT_ACTION_PROPS,
  DATA_FICT_REACT_CLIENT,
  DATA_FICT_REACT_EVENT,
  DATA_FICT_REACT_MOUNTED,
  DATA_FICT_REACT_PREFIX,
  DATA_FICT_REACT_PROPS,
  DATA_FICT_REACT_QRL,
  DATA_FICT_REACT_SSR,
  DEFAULT_CLIENT_DIRECTIVE,
} from './constants'
import { assertReactModuleUrlAllowed } from './module-url-policy'
import { normalizeMountEvents } from './mount-events'
import { parseQrl, resolveModuleUrl } from './qrl'
import { mountReactRoot, type MountedReactRoot } from './react-root'
import { decodePropsFromAttribute } from './serialization'
import { scheduleByClientDirective } from './strategy'
import type { ClientDirective } from './types'

const COMPONENT_LOAD_RETRY_BASE_DELAY_MS = 100
const COMPONENT_LOAD_RETRY_MAX_DELAY_MS = 5_000
const COMPONENT_LOAD_RETRY_MAX_FAILURES = 5

export interface ReactIslandsLoaderOptions {
  /**
   * Document to scan and observe.
   * @default global document
   */
  document?: Document
  /**
   * CSS selector used to find island hosts.
   * @default '[data-fict-react]'
   */
  selector?: string
  /**
   * Enable MutationObserver to auto-mount/dispose and refresh.
   * @default true
   */
  observe?: boolean
  /**
   * Fallback client directive when host attribute is missing or invalid.
   * @default 'load'
   */
  defaultClient?: ClientDirective
  /**
   * Root margin used by visible strategy observers.
   * @default '200px'
   */
  visibleRootMargin?: string
}

interface IslandRuntime {
  refresh: () => void
  dispose: () => void
}

function isDevRuntime(): boolean {
  const host = globalThis as Record<string, unknown>
  const explicitDevFlag = host.__FICT_DEV__
  if (typeof explicitDevFlag === 'boolean') {
    return explicitDevFlag
  }

  if (typeof process !== 'undefined') {
    const nodeEnv = process.env?.NODE_ENV
    if (nodeEnv) {
      return nodeEnv !== 'production'
    }
  }

  if (typeof document !== 'undefined') {
    return Boolean(document.querySelector('script[src*="/@vite/client"]'))
  }

  return false
}

const warnedImmutableAttrs = new WeakMap<HTMLElement, Set<string>>()
const warnedSignalStrategyHosts = new WeakSet<HTMLElement>()

function warnImmutableAttrMutation(host: HTMLElement, attrName: string): void {
  if (!isDevRuntime()) return

  let warned = warnedImmutableAttrs.get(host)
  if (!warned) {
    warned = new Set<string>()
    warnedImmutableAttrs.set(host, warned)
  }

  if (warned.has(attrName)) return
  warned.add(attrName)

  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(
      `[fict/react] Ignored runtime mutation of "${attrName}". Recreate the island host to apply this attribute.`,
    )
  }
}

function warnUnsupportedSignalStrategy(host: HTMLElement): void {
  if (!isDevRuntime()) return
  if (warnedSignalStrategyHosts.has(host)) return
  warnedSignalStrategyHosts.add(host)

  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(
      '[fict/react] Client strategy "signal" is not supported by installReactIslands(); use runtime islands (reactify/reactify$) instead.',
    )
  }
}

function isClientDirective(value: string | null | undefined): value is ClientDirective {
  return (
    value === 'load' ||
    value === 'idle' ||
    value === 'visible' ||
    value === 'hover' ||
    value === 'event' ||
    value === 'signal' ||
    value === 'only'
  )
}

function pickClientDirective(host: HTMLElement, fallback: ClientDirective): ClientDirective {
  const raw = host.getAttribute(DATA_FICT_REACT_CLIENT)
  return isClientDirective(raw) ? raw : fallback
}

async function loadComponentFromQrl(qrl: string): Promise<ComponentType<Record<string, unknown>>> {
  const { url, exportName } = parseQrl(qrl)
  if (!url) {
    throw new Error('[fict/react] React island is missing module URL in data-fict-react.')
  }

  const resolvedUrl = resolveModuleUrl(url)
  assertReactModuleUrlAllowed(resolvedUrl, 'component')
  const mod = await loadLoaderComponentModule(resolvedUrl)
  const candidate = (mod[exportName] ?? mod.default) as unknown

  if (typeof candidate !== 'function') {
    throw new Error(
      `[fict/react] Export "${exportName}" from "${resolvedUrl}" is not a React component.`,
    )
  }

  return candidate as ComponentType<Record<string, unknown>>
}

function retryDelayMs(failures: number): number {
  return Math.min(
    COMPONENT_LOAD_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, failures - 1),
    COMPONENT_LOAD_RETRY_MAX_DELAY_MS,
  )
}
function readSerializedProps(host: HTMLElement): Record<string, unknown> {
  return decodePropsFromAttribute(host.getAttribute(DATA_FICT_REACT_PROPS))
}

function readActionProps(host: HTMLElement): string[] {
  const encoded = host.getAttribute(DATA_FICT_REACT_ACTION_PROPS)
  if (!encoded) return []

  try {
    const decoded = decodeURIComponent(encoded)
    const parsed = JSON.parse(decoded) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((name) => name.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function readRenderableProps(host: HTMLElement): Record<string, unknown> {
  return materializeReactProps(readSerializedProps(host), readActionProps(host))
}

function readIdentifierPrefix(host: HTMLElement): string | undefined {
  const value = host.getAttribute(DATA_FICT_REACT_PREFIX)
  return value ?? undefined
}

function readMountEvents(host: HTMLElement): string[] {
  return normalizeMountEvents(host.getAttribute(DATA_FICT_REACT_EVENT))
}

function createIslandRuntime(
  host: HTMLElement,
  options: Required<ReactIslandsLoaderOptions>,
): IslandRuntime {
  const qrl = host.getAttribute(DATA_FICT_REACT_QRL)
  if (!qrl) {
    return {
      refresh: () => {},
      dispose: () => {},
    }
  }

  const client = pickClientDirective(host, options.defaultClient)
  const canHydrate = host.getAttribute(DATA_FICT_REACT_SSR) === '1' && client !== 'only'
  const identifierPrefix = readIdentifierPrefix(host)
  const mountEvents = readMountEvents(host)

  if (client === 'signal') {
    warnUnsupportedSignalStrategy(host)
  }

  let disposed = false
  let root: MountedReactRoot | null = null
  let component: ComponentType<Record<string, unknown>> | null = null
  let loadPromise: Promise<ComponentType<Record<string, unknown>>> | null = null
  let loadFailures = 0
  let nextLoadRetryAt = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let mountCleanup: (() => void) | null = null

  const clearRetryTimer = () => {
    if (retryTimer === null) return
    clearTimeout(retryTimer)
    retryTimer = null
  }

  const ensureComponent = async (): Promise<ComponentType<Record<string, unknown>>> => {
    const now = Date.now()
    if (nextLoadRetryAt > now) {
      const waitMs = nextLoadRetryAt - now
      throw new Error(`[fict/react] React island load cooldown active; retry in ${waitMs}ms.`)
    }

    if (component) {
      return component
    }
    if (loadPromise) {
      return loadPromise
    }

    loadPromise = loadComponentFromQrl(qrl)
      .then((loaded) => {
        component = loaded
        loadFailures = 0
        nextLoadRetryAt = 0
        loadPromise = null
        return loaded
      })
      .catch((error) => {
        loadPromise = null
        loadFailures += 1
        nextLoadRetryAt = Date.now() + retryDelayMs(loadFailures)
        throw error
      })

    return loadPromise
  }

  const renderCurrent = () => {
    if (!root || !component || disposed) return
    root.render(createReactElement(component, readRenderableProps(host)))
  }

  const mount = () => {
    void (async () => {
      if (disposed || root) return

      let loaded: ComponentType<Record<string, unknown>>
      try {
        loaded = await ensureComponent()
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error('[fict/react] Failed to load React island component from loader.', error)
        }
        if (!disposed && !root && loadFailures < COMPONENT_LOAD_RETRY_MAX_FAILURES) {
          const waitMs = Math.max(0, nextLoadRetryAt - Date.now())
          clearRetryTimer()
          retryTimer = setTimeout(mount, waitMs)
        }
        return
      }
      if (disposed || root) return

      const node = createReactElement(loaded, readRenderableProps(host))
      const mountOptions = identifierPrefix
        ? {
            hydrate: canHydrate,
            identifierPrefix,
          }
        : {
            hydrate: canHydrate,
          }

      root = mountReactRoot(host, node, mountOptions)
      host.setAttribute(DATA_FICT_REACT_MOUNTED, '1')
      clearRetryTimer()
    })().catch((error) => {
      if (typeof console !== 'undefined' && typeof console.error === 'function') {
        console.error('[fict/react] Failed to mount React island from loader.', error)
      }
    })
  }

  const scheduleOptions: {
    document?: Document
    window?: Window
    visibleRootMargin?: string
    events?: string[]
  } = {
    document: host.ownerDocument,
    events: mountEvents,
    visibleRootMargin: options.visibleRootMargin,
  }
  const ownerWindow = host.ownerDocument.defaultView
  if (ownerWindow) {
    scheduleOptions.window = ownerWindow
  }

  mountCleanup = scheduleByClientDirective(client, host, mount, scheduleOptions)

  return {
    refresh: renderCurrent,
    dispose: () => {
      disposed = true
      mountCleanup?.()
      mountCleanup = null
      clearRetryTimer()
      root?.unmount()
      root = null
      host.removeAttribute(DATA_FICT_REACT_MOUNTED)
    },
  }
}

function collectIslandHosts(root: Element, selector: string): HTMLElement[] {
  const hosts: HTMLElement[] = []

  if (root instanceof HTMLElement && root.matches(selector)) {
    hosts.push(root)
  }

  for (const node of Array.from(root.querySelectorAll(selector))) {
    if (node instanceof HTMLElement) {
      hosts.push(node)
    }
  }

  return hosts
}

export function installReactIslands(rawOptions: ReactIslandsLoaderOptions = {}): () => void {
  const doc = rawOptions.document ?? (typeof document !== 'undefined' ? document : undefined)
  if (!doc) {
    return () => {}
  }

  const options: Required<ReactIslandsLoaderOptions> = {
    document: doc,
    selector: rawOptions.selector ?? `[${DATA_FICT_REACT_QRL}]`,
    observe: rawOptions.observe !== false,
    defaultClient: rawOptions.defaultClient ?? DEFAULT_CLIENT_DIRECTIVE,
    visibleRootMargin: rawOptions.visibleRootMargin ?? '200px',
  }

  const runtimes = new Map<HTMLElement, IslandRuntime>()

  const disposeHost = (host: HTMLElement) => {
    const runtime = runtimes.get(host)
    if (!runtime) return
    runtime.dispose()
    runtimes.delete(host)
  }

  const mountHost = (host: HTMLElement) => {
    if (runtimes.has(host)) return
    const runtime = createIslandRuntime(host, options)
    runtimes.set(host, runtime)
  }

  const scanNode = (node: Element) => {
    const hosts = collectIslandHosts(node, options.selector)
    for (const host of hosts) {
      mountHost(host)
    }
  }

  scanNode(doc.documentElement)

  let observer: MutationObserver | null = null
  if (options.observe && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
          const target = mutation.target
          if (
            mutation.attributeName === DATA_FICT_REACT_PROPS ||
            mutation.attributeName === DATA_FICT_REACT_ACTION_PROPS
          ) {
            runtimes.get(target)?.refresh()
            continue
          }

          if (mutation.attributeName === DATA_FICT_REACT_QRL) {
            disposeHost(target)
            if (target.matches(options.selector) && target.getAttribute(DATA_FICT_REACT_QRL)) {
              mountHost(target)
            }
            continue
          }

          if (
            mutation.attributeName === DATA_FICT_REACT_CLIENT ||
            mutation.attributeName === DATA_FICT_REACT_SSR ||
            mutation.attributeName === DATA_FICT_REACT_PREFIX ||
            mutation.attributeName === DATA_FICT_REACT_EVENT
          ) {
            if (runtimes.has(target)) {
              warnImmutableAttrMutation(target, mutation.attributeName)
            }
          }
          continue
        }

        if (mutation.type !== 'childList') continue

        for (const added of Array.from(mutation.addedNodes)) {
          if (!(added instanceof Element)) continue
          scanNode(added)
        }

        for (const removed of Array.from(mutation.removedNodes)) {
          if (!(removed instanceof Element)) continue
          for (const host of collectIslandHosts(removed, options.selector)) {
            if (host.isConnected) continue
            disposeHost(host)
          }
        }
      }
    })

    observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        DATA_FICT_REACT_PROPS,
        DATA_FICT_REACT_QRL,
        DATA_FICT_REACT_ACTION_PROPS,
        DATA_FICT_REACT_CLIENT,
        DATA_FICT_REACT_SSR,
        DATA_FICT_REACT_PREFIX,
        DATA_FICT_REACT_EVENT,
      ],
    })
  }

  return () => {
    observer?.disconnect()
    observer = null

    for (const host of Array.from(runtimes.keys())) {
      disposeHost(host)
    }
  }
}
