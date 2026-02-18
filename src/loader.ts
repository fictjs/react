import { createElement as createReactElement, type ComponentType } from 'react'

import {
  DATA_FICT_REACT_CLIENT,
  DATA_FICT_REACT_MOUNTED,
  DATA_FICT_REACT_PREFIX,
  DATA_FICT_REACT_PROPS,
  DATA_FICT_REACT_QRL,
  DATA_FICT_REACT_SSR,
  DEFAULT_CLIENT_DIRECTIVE,
} from './constants'
import { parseQrl, resolveModuleUrl } from './qrl'
import { mountReactRoot, type MountedReactRoot } from './react-root'
import { decodePropsFromAttribute } from './serialization'
import { scheduleByClientDirective } from './strategy'
import type { ClientDirective } from './types'

export interface ReactIslandsLoaderOptions {
  document?: Document
  selector?: string
  observe?: boolean
  defaultClient?: ClientDirective
  visibleRootMargin?: string
}

interface IslandRuntime {
  refresh: () => void
  dispose: () => void
}

function isClientDirective(value: string | null | undefined): value is ClientDirective {
  return value === 'load' || value === 'idle' || value === 'visible' || value === 'only'
}

function pickClientDirective(host: HTMLElement, fallback: ClientDirective): ClientDirective {
  const raw = host.getAttribute(DATA_FICT_REACT_CLIENT)
  return isClientDirective(raw) ? raw : fallback
}

async function loadComponentFromQrl(
  qrl: string,
): Promise<ComponentType<Record<string, unknown>>> {
  const { url, exportName } = parseQrl(qrl)
  if (!url) {
    throw new Error('[fict/react] React island is missing module URL in data-fict-react.')
  }

  const resolvedUrl = resolveModuleUrl(url)
  const mod = (await import(/* @vite-ignore */ resolvedUrl)) as Record<string, unknown>
  const candidate = (mod[exportName] ?? mod.default) as unknown

  if (typeof candidate !== 'function') {
    throw new Error(
      `[fict/react] Export "${exportName}" from "${resolvedUrl}" is not a React component.`,
    )
  }

  return candidate as ComponentType<Record<string, unknown>>
}

function readSerializedProps(host: HTMLElement): Record<string, unknown> {
  return decodePropsFromAttribute(host.getAttribute(DATA_FICT_REACT_PROPS))
}

function readIdentifierPrefix(host: HTMLElement): string | undefined {
  const value = host.getAttribute(DATA_FICT_REACT_PREFIX)
  return value ?? undefined
}

function createIslandRuntime(host: HTMLElement, options: Required<ReactIslandsLoaderOptions>): IslandRuntime {
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

  let disposed = false
  let root: MountedReactRoot | null = null
  let component: ComponentType<Record<string, unknown>> | null = null
  let loadPromise: Promise<ComponentType<Record<string, unknown>>> | null = null
  let mountCleanup: (() => void) | null = null

  const ensureComponent = async (): Promise<ComponentType<Record<string, unknown>>> => {
    if (component) {
      return component
    }
    if (loadPromise) {
      return loadPromise
    }

    loadPromise = loadComponentFromQrl(qrl).then(loaded => {
      component = loaded
      return loaded
    })

    return loadPromise
  }

  const renderCurrent = () => {
    if (!root || !component || disposed) return
    root.render(createReactElement(component, readSerializedProps(host)))
  }

  const mount = () => {
    void (async () => {
      if (disposed || root) return

      const loaded = await ensureComponent()
      if (disposed || root) return

      const node = createReactElement(loaded, readSerializedProps(host))
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
    })().catch(error => {
      if (typeof console !== 'undefined' && typeof console.error === 'function') {
        console.error('[fict/react] Failed to mount React island from loader.', error)
      }
    })
  }

  const scheduleOptions: {
    document?: Document
    window?: Window
    visibleRootMargin?: string
  } = {
    document: host.ownerDocument,
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
    observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
          const target = mutation.target
          if (mutation.attributeName === DATA_FICT_REACT_PROPS) {
            runtimes.get(target)?.refresh()
            continue
          }

          if (mutation.attributeName === DATA_FICT_REACT_QRL) {
            if (!runtimes.has(target) && target.matches(options.selector)) {
              mountHost(target)
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
      attributeFilter: [DATA_FICT_REACT_PROPS, DATA_FICT_REACT_QRL],
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
