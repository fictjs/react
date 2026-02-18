import { beforeEach, describe, expect, it, vi } from 'vitest'

const reactPluginMock = vi.hoisted(() => vi.fn(() => ({ name: 'mock-react-plugin' })))

vi.mock('@vitejs/plugin-react', () => ({
  default: reactPluginMock,
}))

describe('fictReactPreset', () => {
  beforeEach(() => {
    reactPluginMock.mockClear()
    vi.resetModules()
  })

  it('uses src/react lane by default', async () => {
    const { fictReactPreset } = await import('../src/preset')

    const plugins = fictReactPreset()

    expect(plugins).toHaveLength(2)
    expect(reactPluginMock).toHaveBeenCalledTimes(1)
    expect(reactPluginMock).toHaveBeenCalledWith(
      expect.objectContaining({
        include: [/src\/react\/.*\.[jt]sx?$/],
      }),
    )

    const depsPlugin = plugins[1] as { config: () => Record<string, unknown> }
    expect(depsPlugin.config()).toEqual({
      resolve: {
        dedupe: ['react', 'react-dom'],
      },
      optimizeDeps: {
        include: [
          'react',
          'react-dom',
          'react-dom/client',
          'react-dom/server',
          'react/jsx-runtime',
          'react/jsx-dev-runtime',
        ],
      },
    })
  })

  it('passes through include/exclude/extra options', async () => {
    const { fictReactPreset } = await import('../src/preset')

    fictReactPreset({
      include: [/src\/r\//],
      exclude: [/src\/fict\//],
      react: {
        jsxRuntime: 'classic',
      },
    })

    expect(reactPluginMock).toHaveBeenCalledWith(
      expect.objectContaining({
        include: [/src\/r\//],
        exclude: [/src\/fict\//],
        jsxRuntime: 'classic',
      }),
    )
  })

  it('allows disabling and overriding dependency optimization hints', async () => {
    const { fictReactPreset } = await import('../src/preset')

    const disabled = fictReactPreset({
      optimizeReactDeps: false,
    })
    expect(disabled).toHaveLength(1)

    const customized = fictReactPreset({
      reactDedupe: ['react'],
      reactOptimizeDepsInclude: ['react', 'react/jsx-runtime'],
    })
    expect(customized).toHaveLength(2)
    const depsPlugin = customized[1] as { config: () => Record<string, unknown> }
    expect(depsPlugin.config()).toEqual({
      resolve: {
        dedupe: ['react'],
      },
      optimizeDeps: {
        include: ['react', 'react/jsx-runtime'],
      },
    })
  })
})
