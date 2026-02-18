interface ReactActionHost {
  __FICT_REACT_ACTION_CALLS__?: string[]
}

export function recordReactAction(payload: string): void {
  const host = globalThis as ReactActionHost
  ;(host.__FICT_REACT_ACTION_CALLS__ ||= []).push(payload)
}
