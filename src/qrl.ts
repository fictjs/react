export interface ParsedQrl {
  url: string
  exportName: string
}

export function parseQrl(qrl: string): ParsedQrl {
  const [ref] = qrl.split('[')
  if (!ref) {
    return { url: '', exportName: 'default' }
  }

  const hashIndex = ref.lastIndexOf('#')
  if (hashIndex === -1) {
    return { url: ref, exportName: 'default' }
  }

  return {
    url: ref.slice(0, hashIndex),
    exportName: ref.slice(hashIndex + 1) || 'default',
  }
}

export function resolveModuleUrl(url: string): string {
  const manifest = (globalThis as Record<string, unknown>).__FICT_MANIFEST__ as
    | Record<string, string>
    | undefined

  if (manifest?.[url]) {
    return manifest[url]
  }

  return url
}
