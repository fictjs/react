import { describe, expect, it } from 'vitest'

import { materializeReactProps, reactActionFromQrl } from '../src/action'

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
})
