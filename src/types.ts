import type { BaseProps } from '@fictjs/runtime'
import type { ComponentType } from 'react'

export type ClientDirective = 'load' | 'idle' | 'visible' | 'only'

export interface ReactInteropOptions {
  /**
   * Render React subtree on the server via react-dom/server.
   * @default true
   */
  ssr?: boolean
  /**
   * Choose when the client mounts/hydrates the island.
   * @default 'load'
   */
  client?: ClientDirective
  /**
   * Root margin for visible strategy.
   * @default '200px'
   */
  visibleRootMargin?: string
  /**
   * Stable React identifier prefix for useId in multi-root pages.
   */
  identifierPrefix?: string
}

export type MaybeAccessor<T> = T | (() => T)

export interface ReactActionRef {
  __fictReactAction: string
}

export interface ReactifyQrlOptions<P extends Record<string, unknown>> extends ReactInteropOptions {
  /**
   * Module id used by __fictQrl, usually import.meta.url.
   */
  module: string
  /**
   * Export name in the target module.
   * @default 'default'
   */
  export?: string
  /**
   * Optional direct component reference used for eager CSR and SSR.
   * If omitted, client will lazy-import via QRL.
   */
  component?: ComponentType<P>
}

export interface ReactIslandProps<P extends Record<string, unknown>>
  extends BaseProps,
    ReactInteropOptions {
  component: ComponentType<P>
  props?: MaybeAccessor<P>
}
