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

export interface ReactIslandProps<P extends Record<string, unknown>>
  extends BaseProps,
    ReactInteropOptions {
  component: ComponentType<P>
  props?: MaybeAccessor<P>
}
