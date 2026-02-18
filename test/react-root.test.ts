import { beforeEach, describe, expect, it, vi } from 'vitest'

const createRootMock = vi.hoisted(() =>
  vi.fn(() => ({
    render: vi.fn(),
    unmount: vi.fn(),
  })),
)
const hydrateRootMock = vi.hoisted(() =>
  vi.fn(() => ({
    render: vi.fn(),
    unmount: vi.fn(),
  })),
)

vi.mock('react-dom/client', () => ({
  createRoot: createRootMock,
  hydrateRoot: hydrateRootMock,
}))

describe('mountReactRoot', () => {
  beforeEach(() => {
    createRootMock.mockClear()
    hydrateRootMock.mockClear()
  })

  it('hydrates when host has SSR content and hydrate=true', async () => {
    const { mountReactRoot } = await import('../src/react-root')
    const host = document.createElement('div')
    host.setAttribute('data-fict-react-ssr', '1')
    host.innerHTML = '<span>ssr</span>'

    mountReactRoot(host, 'node', { hydrate: true })

    expect(hydrateRootMock).toHaveBeenCalledTimes(1)
    expect(createRootMock).toHaveBeenCalledTimes(0)
  })

  it('falls back to createRoot when hydrate=false or no SSR content', async () => {
    const { mountReactRoot } = await import('../src/react-root')

    const hostNoSSR = document.createElement('div')
    mountReactRoot(hostNoSSR, 'node', { hydrate: true })

    const hostClientOnly = document.createElement('div')
    hostClientOnly.setAttribute('data-fict-react-ssr', '1')
    hostClientOnly.innerHTML = '<span>ssr</span>'
    mountReactRoot(hostClientOnly, 'node', { hydrate: false })

    expect(createRootMock).toHaveBeenCalledTimes(2)
    expect(hydrateRootMock).toHaveBeenCalledTimes(0)
  })
})
