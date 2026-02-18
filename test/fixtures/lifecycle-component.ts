import React, { useEffect } from 'react'

interface LifecycleCounterHost {
  __FICT_REACT_MOUNT_COUNT__?: number
  __FICT_REACT_UNMOUNT_COUNT__?: number
}

export function LifecycleComponent(props: { label: string }) {
  useEffect(() => {
    const host = globalThis as LifecycleCounterHost
    host.__FICT_REACT_MOUNT_COUNT__ = (host.__FICT_REACT_MOUNT_COUNT__ ?? 0) + 1

    return () => {
      host.__FICT_REACT_UNMOUNT_COUNT__ = (host.__FICT_REACT_UNMOUNT_COUNT__ ?? 0) + 1
    }
  }, [])

  return React.createElement('div', { 'data-testid': 'lifecycle-value' }, props.label)
}

export default LifecycleComponent
