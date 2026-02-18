import react, { type Options as ReactPluginOptions } from '@vitejs/plugin-react'
import type { PluginOption } from 'vite'

export interface FictReactPresetOptions {
  /**
   * React transform include filter. Keep it narrow so Fict TSX can use Fict compiler/runtime.
   * @default [/src\/react\/.*\.[jt]sx?$/]
   */
  include?: ReactPluginOptions['include']
  /**
   * Optional exclude filter for React transform.
   */
  exclude?: ReactPluginOptions['exclude']
  /**
   * Additional @vitejs/plugin-react options.
   * `include` and `exclude` are controlled by this preset.
   */
  react?: Omit<ReactPluginOptions, 'include' | 'exclude'>
}

/**
 * Configure React transform as an island lane inside a Fict project.
 * Usage:
 * - Put React files in src/react/** (default include)
 * - Keep Fict files outside that lane
 */
export function fictReactPreset(options: FictReactPresetOptions = {}): PluginOption[] {
  const reactOptions: ReactPluginOptions = {
    ...(options.react ?? {}),
    include: options.include ?? [/src\/react\/.*\.[jt]sx?$/],
  }

  if (options.exclude !== undefined) {
    reactOptions.exclude = options.exclude
  }

  return [react(reactOptions)]
}
