import React from 'react'

export interface ActionButtonComponentProps {
  label: string
  onAction?: (payload: string) => void
}

export function ActionButtonComponent(props: ActionButtonComponentProps) {
  return React.createElement(
    'button',
    {
      id: 'action-button',
      onClick: () => props.onAction?.(`clicked:${props.label}`),
    },
    props.label,
  )
}

export default ActionButtonComponent
