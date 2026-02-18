import React from 'react'

export function RemoteWidget(props: { label: string; count: number }) {
  return React.createElement('div', { 'data-testid': `${props.label}-value` }, `${props.label}:${props.count}`)
}

export function LoaderWidget(props: { label: string; count: number }) {
  return React.createElement('div', { 'data-testid': 'loader-value' }, `${props.label}:${props.count}`)
}
