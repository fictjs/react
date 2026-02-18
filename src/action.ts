import { __fictQrl } from '@fictjs/runtime/internal'

import { parseQrl, resolveModuleUrl } from './qrl'
import type { ReactActionRef } from './types'

const ACTION_KEY = '__fictReactAction'
const moduleCache = new Map<string, Promise<Record<string, unknown>>>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

async function invokeReactAction(qrl: string, args: unknown[]): Promise<void> {
  const { url, exportName } = parseQrl(qrl)
  if (!url) {
    throw new Error('[fict/react] React action QRL is missing module URL.')
  }

  const resolvedUrl = resolveModuleUrl(url)
  let modPromise = moduleCache.get(resolvedUrl)
  if (!modPromise) {
    modPromise = import(/* @vite-ignore */ resolvedUrl) as Promise<Record<string, unknown>>
    moduleCache.set(resolvedUrl, modPromise)
  }

  const mod = await modPromise
  const candidate = (mod[exportName] ?? mod.default) as unknown
  if (typeof candidate !== 'function') {
    throw new Error(
      `[fict/react] Export "${exportName}" from "${resolvedUrl}" is not a callable action.`,
    )
  }

  await (candidate as (...actionArgs: unknown[]) => unknown)(...args)
}

function toActionHandler(qrl: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    void invokeReactAction(qrl, args).catch(error => {
      if (typeof console !== 'undefined' && typeof console.error === 'function') {
        console.error('[fict/react] Failed to execute React action.', error)
      }
    })
  }
}

export function isReactActionRef(value: unknown): value is ReactActionRef {
  return isRecord(value) && typeof value[ACTION_KEY] === 'string'
}

export function reactActionFromQrl(qrl: string): ReactActionRef {
  return {
    [ACTION_KEY]: qrl,
  }
}

export function reactAction$(moduleId: string, exportName = 'default'): ReactActionRef {
  return reactActionFromQrl(__fictQrl(moduleId, exportName))
}

function materializeValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (isReactActionRef(value)) {
    return toActionHandler(value.__fictReactAction)
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return seen.get(value)
    }

    const next: unknown[] = []
    seen.set(value, next)
    for (const item of value) {
      next.push(materializeValue(item, seen))
    }
    return next
  }

  if (isPlainObject(value)) {
    if (seen.has(value)) {
      return seen.get(value)
    }

    const next: Record<string, unknown> = {}
    seen.set(value, next)

    for (const key of Object.keys(value)) {
      next[key] = materializeValue(value[key], seen)
    }

    return next
  }

  return value
}

export function materializeReactProps<T>(value: T): T {
  return materializeValue(value, new WeakMap()) as T
}
