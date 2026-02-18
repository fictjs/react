import React from 'react'

export interface LoaderComponentProps {
  label: string
  count?: number
}

export function LoaderComponent(props: LoaderComponentProps) {
  return React.createElement('div', { className: 'loader-component' }, `${props.label}:${props.count ?? 0}`)
}

export default LoaderComponent
