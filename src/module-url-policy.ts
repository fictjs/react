export type ReactModuleLoadKind = 'component' | 'action'

export type ReactModuleUrlPolicy = (resolvedUrl: string, kind: ReactModuleLoadKind) => boolean

const BROWSER_BLOCKED_PROTOCOLS = new Set(['data:', 'javascript:'])

function isNodeRuntime(): boolean {
  return typeof process !== 'undefined' && Boolean(process.versions?.node)
}

function defaultReactModuleUrlPolicy(resolvedUrl: string): boolean {
  if (isNodeRuntime()) {
    return true
  }

  if (typeof window === 'undefined' || !window.location) {
    return true
  }

  try {
    const target = new URL(resolvedUrl, window.location.href)
    if (BROWSER_BLOCKED_PROTOCOLS.has(target.protocol)) {
      return false
    }

    return target.origin === window.location.origin
  } catch {
    return false
  }
}

let moduleUrlPolicy: ReactModuleUrlPolicy = defaultReactModuleUrlPolicy

export function setReactModuleUrlPolicy(policy: ReactModuleUrlPolicy | null): void {
  moduleUrlPolicy = policy ?? defaultReactModuleUrlPolicy
}

export function isReactModuleUrlAllowed(resolvedUrl: string, kind: ReactModuleLoadKind): boolean {
  return moduleUrlPolicy(resolvedUrl, kind)
}

export function assertReactModuleUrlAllowed(
  resolvedUrl: string,
  kind: ReactModuleLoadKind,
): void {
  if (isReactModuleUrlAllowed(resolvedUrl, kind)) {
    return
  }

  throw new Error(
    `[fict/react] Blocked ${kind} module URL "${resolvedUrl}" by security policy. ` +
      'Use setReactModuleUrlPolicy(...) to allow trusted non-default sources.',
  )
}
