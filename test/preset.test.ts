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

    expect(plugins).toHaveLength(1)
    expect(reactPluginMock).toHaveBeenCalledTimes(1)
    expect(reactPluginMock).toHaveBeenCalledWith(
      expect.objectContaining({
        include: [/src\/react\/.*\.[jt]sx?$/],
      }),
    )
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
})
