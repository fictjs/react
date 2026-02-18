import type { BaseProps } from '@fictjs/runtime'
import type { ComponentType } from 'react'

/**
 * Controls when the React island mounts on the client.
 */
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
  /**
   * Additional prop names that should be treated as action callbacks.
   * By default only /^on[A-Z]/ props are materialized.
   */
  actionProps?: string[]
}

/**
 * Static value or lazy accessor used by Fict props.
 */
export type MaybeAccessor<T> = T | (() => T)

/**
 * Serializable marker payload used to represent a React action callback.
 */
export interface ReactActionRef {
  __fictReactActionMarker: 'fict.react.action.v1'
  __fictReactActionQrl: string
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
  extends BaseProps, ReactInteropOptions {
  component: ComponentType<P>
  props?: MaybeAccessor<P>
}
