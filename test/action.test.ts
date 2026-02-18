import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  __resetReactActionCachesForTests,
  __setReactActionModuleLoaderForTests,
  materializeReactProps,
  reactActionFromQrl,
} from '../src/action'

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const tick = async (ms = 0) => {
  await new Promise(resolve => setTimeout(resolve, ms))
}

afterEach(() => {
  __resetReactActionCachesForTests()
  vi.useRealTimers()
})

describe('materializeReactProps', () => {
  it('returns original props object when no action callback prop exists', () => {
    const props = {
      data: { id: 1 },
      items: [1, 2, 3],
    }

    const result = materializeReactProps(props)
    expect(result).toBe(props)
    expect(result.data).toBe(props.data)
    expect(result.items).toBe(props.items)
  })

  it('materializes default onX callback props and preserves other references', () => {
    const actionRef = reactActionFromQrl('/mock/module.js#run')
    const nested = { stable: true }
    const props = {
      onAction: actionRef,
      nested,
    }

    const result = materializeReactProps(props)

    expect(result).not.toBe(props)
    expect(typeof result.onAction).toBe('function')
    expect(result.nested).toBe(nested)
  })

  it('materializes configured non-onX callback props via actionProps', () => {
    const actionRef = reactActionFromQrl('/mock/module.js#run')
    const props = {
      submitAction: actionRef,
    }

    const withoutConfig = materializeReactProps(props)
    expect(withoutConfig.submitAction).toEqual(actionRef)

    const withConfig = materializeReactProps(props, ['submitAction'])
    expect(typeof withConfig.submitAction).toBe('function')
  })

  it('clears failed import cache and retries after backoff cooldown', async () => {
    const actionCalls: string[] = []
    let attempts = 0
    __setReactActionModuleLoaderForTests(async () => {
      attempts += 1
      if (attempts === 1) {
        throw new Error('first-load-failure')
      }
      return {
        run(payload: string) {
          actionCalls.push(payload)
        },
      }
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const props = materializeReactProps({
      onAction: reactActionFromQrl('/mock/module.js#run'),
    })
    const onAction = props.onAction as (payload: string) => void

    onAction('first')
    await flushMicrotasks()
    expect(attempts).toBe(1)
    expect(actionCalls).toEqual([])

    onAction('second')
    await flushMicrotasks()
    expect(attempts).toBe(1)

    await tick(110)
    onAction('third')
    await flushMicrotasks()
    await tick(0)

    expect(attempts).toBe(2)
    expect(actionCalls).toEqual(['third'])

    consoleSpy.mockRestore()
  })
})
