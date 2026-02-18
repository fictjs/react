import React from 'react'

export interface LoaderComponentAltProps {
  label: string
  count?: number
}

export function LoaderComponentAlt(props: LoaderComponentAltProps) {
  return React.createElement(
    'div',
    { className: 'loader-component-alt' },
    `ALT-${props.label}:${props.count ?? 0}`,
  )
}

export default LoaderComponentAlt
