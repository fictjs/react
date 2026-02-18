import React from 'react'

export interface CustomActionComponentProps {
  label: string
  submitAction?: (payload: string) => void
}

export function CustomActionComponent(props: CustomActionComponentProps) {
  return React.createElement(
    'button',
    {
      id: 'custom-action-button',
      onClick: () => props.submitAction?.(`custom:${props.label}`),
    },
    props.label,
  )
}

export default CustomActionComponent
