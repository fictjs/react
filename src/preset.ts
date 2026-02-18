import react, { type Options as ReactPluginOptions } from '@vitejs/plugin-react'
import type { PluginOption } from 'vite'

const DEFAULT_REACT_DEDUPE = ['react', 'react-dom']
const DEFAULT_REACT_OPTIMIZE_DEPS_INCLUDE = [
  'react',
  'react-dom',
  'react-dom/client',
  'react-dom/server',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
]

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
  /**
   * Inject Vite React dependency hints (`resolve.dedupe` + `optimizeDeps.include`).
   * Helps avoid duplicate React instances and missing pre-bundles in mixed projects.
   * @default true
   */
  optimizeReactDeps?: boolean
  /**
   * React packages to dedupe when `optimizeReactDeps` is enabled.
   */
  reactDedupe?: string[]
  /**
   * Dependencies to include in Vite pre-bundling when `optimizeReactDeps` is enabled.
   */
  reactOptimizeDepsInclude?: string[]
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

  const plugins: PluginOption[] = [react(reactOptions)]

  if (options.optimizeReactDeps !== false) {
    plugins.push({
      name: 'fict-react-deps',
      config() {
        return {
          resolve: {
            dedupe: options.reactDedupe ?? DEFAULT_REACT_DEDUPE,
          },
          optimizeDeps: {
            include: options.reactOptimizeDepsInclude ?? DEFAULT_REACT_OPTIMIZE_DEPS_INCLUDE,
          },
        }
      },
    })
  }

  return plugins
}
