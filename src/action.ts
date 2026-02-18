import { __fictQrl } from '@fictjs/runtime/internal'

import { parseQrl, resolveModuleUrl } from './qrl'
import type { ReactActionRef } from './types'

const ACTION_KEY = '__fictReactAction'
const ACTION_PROP_PATTERN = /^on[A-Z]/

const moduleCache = new Map<string, Promise<Record<string, unknown>>>()
const actionHandlerCache = new Map<string, (...args: unknown[]) => void>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function copyOwnRecord(source: Record<string | symbol, unknown>): Record<string | symbol, unknown> {
  const out: Record<string | symbol, unknown> = {}
  for (const key of Reflect.ownKeys(source)) {
    out[key] = source[key]
  }
  return out
}

function toActionPropSet(actionProps: readonly string[] | undefined): Set<string> {
  const set = new Set<string>()
  if (!actionProps) return set

  for (const name of actionProps) {
    if (typeof name !== 'string') continue
    const trimmed = name.trim()
    if (!trimmed) continue
    set.add(trimmed)
  }

  return set
}

function shouldMaterializeActionProp(propName: string, actionProps: Set<string>): boolean {
  return ACTION_PROP_PATTERN.test(propName) || actionProps.has(propName)
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
  const cached = actionHandlerCache.get(qrl)
  if (cached) {
    return cached
  }

  const handler = (...args: unknown[]) => {
    void invokeReactAction(qrl, args).catch(error => {
      if (typeof console !== 'undefined' && typeof console.error === 'function') {
        console.error('[fict/react] Failed to execute React action.', error)
      }
    })
  }

  actionHandlerCache.set(qrl, handler)
  return handler
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

export function materializeReactProps<T>(
  value: T,
  actionProps: readonly string[] | undefined = undefined,
): T {
  if (!isRecord(value) || Array.isArray(value)) {
    return value
  }

  const src = value as Record<string | symbol, unknown>
  const actionPropSet = toActionPropSet(actionProps)

  let next: Record<string | symbol, unknown> | null = null

  for (const key of Reflect.ownKeys(src)) {
    if (typeof key !== 'string') continue
    if (!shouldMaterializeActionProp(key, actionPropSet)) continue

    const current = src[key]
    if (!isReactActionRef(current)) continue

    if (next === null) {
      next = copyOwnRecord(src)
    }
    next[key] = toActionHandler(current.__fictReactAction)
  }

  return (next ?? value) as T
}
