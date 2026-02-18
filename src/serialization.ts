import { deserializeValue, serializeValue } from '@fictjs/runtime/internal'

export function encodePropsForAttribute(props: Record<string, unknown>): string {
  try {
    const serialized = serializeValue(props)
    return encodeURIComponent(JSON.stringify(serialized))
  } catch {
    return encodeURIComponent('{}')
  }
}

export function decodePropsFromAttribute(encoded: string | null): Record<string, unknown> {
  if (!encoded) return {}

  try {
    const decoded = decodeURIComponent(encoded)
    const parsed = JSON.parse(decoded) as unknown
    const value = deserializeValue(parsed)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {}
    }
    return value as Record<string, unknown>
  } catch {
    return {}
  }
}
