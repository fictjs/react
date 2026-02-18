function pushEventNames(raw: string, out: string[]): void {
  const input = raw.trim()
  if (!input) return

  if (input.startsWith('[')) {
    try {
      const parsed = JSON.parse(input) as unknown
      if (Array.isArray(parsed)) {
        for (const name of parsed) {
          if (typeof name !== 'string') continue
          const trimmed = name.trim()
          if (trimmed) out.push(trimmed)
        }
        return
      }
    } catch {
      // Fall through to comma parsing.
    }
  }

  for (const part of input.split(',')) {
    const trimmed = part.trim()
    if (trimmed) out.push(trimmed)
  }
}

export function normalizeMountEvents(value: string | string[] | null | undefined): string[] {
  if (value == null) return []

  const values: string[] = []
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== 'string') continue
      pushEventNames(item, values)
    }
  } else if (typeof value === 'string') {
    pushEventNames(value, values)
  }

  return Array.from(new Set(values))
}
