import type { ReactNode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'

export interface MountReactRootOptions {
  hydrate: boolean
  identifierPrefix?: string
}

export interface MountedReactRoot {
  render(node: ReactNode): void
  unmount(): void
}

function hasHydratableContent(host: HTMLElement): boolean {
  return (
    host.hasAttribute('data-fict-react-ssr') &&
    host.childNodes.length > 0 &&
    host.innerHTML.trim().length > 0
  )
}

export function mountReactRoot(
  host: HTMLElement,
  node: ReactNode,
  options: MountReactRootOptions,
): MountedReactRoot {
  const rootOptions = options.identifierPrefix
    ? {
        identifierPrefix: options.identifierPrefix,
      }
    : undefined

  const shouldHydrate = options.hydrate && hasHydratableContent(host)
  if (shouldHydrate) {
    return hydrateRoot(host, node, rootOptions)
  }

  const root = createRoot(host, rootOptions)
  root.render(node)
  return root
}
