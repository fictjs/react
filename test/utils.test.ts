import { afterEach, describe, expect, it } from 'vitest'

import { createReactQrl } from '../src'
import { isReactActionRef, reactActionFromQrl } from '../src/action'
import { parseQrl, resolveModuleUrl } from '../src/qrl'
import { decodePropsFromAttribute, encodePropsForAttribute } from '../src/serialization'

const runtimeHost = globalThis as { __FICT_MANIFEST__?: Record<string, string> }

afterEach(() => {
  runtimeHost.__FICT_MANIFEST__ = undefined
})

describe('qrl utils', () => {
  it('parses empty and malformed qrl strings safely', () => {
    expect(parseQrl('')).toEqual({ url: '', exportName: 'default' })
    expect(parseQrl('#')).toEqual({ url: '', exportName: 'default' })
    expect(parseQrl('##foo')).toEqual({ url: '#', exportName: 'foo' })
    expect(parseQrl('/mod.ts#')).toEqual({ url: '/mod.ts', exportName: 'default' })
  })

  it('parses qrl strings with serialized suffix segments', () => {
    expect(parseQrl('/mod.ts#run[scope]')).toEqual({ url: '/mod.ts', exportName: 'run' })
  })

  it('resolves module URL through manifest mapping when present', () => {
    runtimeHost.__FICT_MANIFEST__ = {
      '/src/widget.tsx': '/assets/widget.abcd1234.js',
    }

    expect(resolveModuleUrl('/src/widget.tsx')).toBe('/assets/widget.abcd1234.js')
    expect(resolveModuleUrl('/src/missing.tsx')).toBe('/src/missing.tsx')
  })
})

describe('serialization utils', () => {
  it('round-trips serializable props through attribute payload encoding', () => {
    const input = { label: 'demo', count: 3, nested: { ok: true } }
    const encoded = encodePropsForAttribute(input)

    expect(decodePropsFromAttribute(encoded)).toEqual(input)
  })

  it('returns empty object for missing, corrupted, and invalid payloads', () => {
    expect(decodePropsFromAttribute(null)).toEqual({})
    expect(decodePropsFromAttribute('%')).toEqual({})
    expect(decodePropsFromAttribute(encodeURIComponent('{not-json'))).toEqual({})
    expect(decodePropsFromAttribute(encodeURIComponent('123'))).toEqual({})
  })
})

describe('action ref guard', () => {
  it('accepts both marker-based and legacy action ref payloads', () => {
    expect(isReactActionRef(reactActionFromQrl('/mod.ts#run'))).toBe(true)
    expect(isReactActionRef({ __fictReactAction: '/legacy.ts#run' })).toBe(true)
  })

  it('rejects non-action payloads', () => {
    expect(isReactActionRef({ __fictReactActionQrl: '/mod.ts#run' })).toBe(false)
    expect(isReactActionRef({ __fictReactAction: '/legacy.ts#run', extra: true })).toBe(false)
    expect(isReactActionRef(null)).toBe(false)
    expect(isReactActionRef('')).toBe(false)
  })
})

describe('createReactQrl', () => {
  it('creates qrl with default and explicit export names', () => {
    expect(createReactQrl('/virtual/module.ts')).toBe('/virtual/module.ts#default')
    expect(createReactQrl('/virtual/module.ts', 'Widget')).toBe('/virtual/module.ts#Widget')
  })
})
