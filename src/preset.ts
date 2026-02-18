import react from '@vitejs/plugin-react'
import type { PluginOption } from 'vite'

export interface FictReactPresetOptions {
  include?: RegExp | RegExp[]
}

/**
 * Lightweight preset for routing React files through @vitejs/plugin-react.
 * Full dual-runtime preset behavior is implemented in a later feature commit.
 */
export function fictReactPreset(options: FictReactPresetOptions = {}): PluginOption[] {
  const include = options.include ?? [/src\/react\/.*\.[jt]sx?$/]
  return [react({ include })]
}
