import React, { useEffect } from 'react'

interface E2EState {
  lifecycleMounts: number
  lifecycleUnmounts: number
  actionCalls: string[]
}

declare global {
  interface Window {
    __FICT_E2E__?: E2EState
  }
}

function ensureE2EState(): E2EState {
  if (!window.__FICT_E2E__) {
    window.__FICT_E2E__ = {
      lifecycleMounts: 0,
      lifecycleUnmounts: 0,
      actionCalls: [],
    }
  }

  return window.__FICT_E2E__
}

export function RemoteWidget(props: { label: string; count: number }) {
  return React.createElement(
    'div',
    { 'data-testid': `${props.label}-value` },
    `${props.label}:${props.count}`,
  )
}

export function LoaderWidget(props: { label: string; count: number }) {
  return React.createElement(
    'div',
    { 'data-testid': 'loader-value' },
    `${props.label}:${props.count}`,
  )
}

export function LoaderWidgetAlt(props: { label: string; count: number }) {
  return React.createElement(
    'div',
    { 'data-testid': 'loader-value' },
    `ALT-${props.label}:${props.count}`,
  )
}

export function StrategyWidget(props: { testId: string; label: string }) {
  return React.createElement('div', { 'data-testid': props.testId }, props.label)
}

export function ActionWidget(props: { label: string; onAction?: (payload: string) => void }) {
  return React.createElement(
    'button',
    {
      id: 'action-widget-trigger',
      'data-testid': 'action-widget-trigger',
      onClick: () => {
        props.onAction?.(`action:${props.label}`)
      },
    },
    `trigger:${props.label}`,
  )
}

export function LifecycleWidget(props: { label: string }) {
  useEffect(() => {
    const state = ensureE2EState()
    state.lifecycleMounts += 1

    return () => {
      state.lifecycleUnmounts += 1
    }
  }, [])

  return React.createElement('div', { 'data-testid': 'loader-lifecycle-value' }, props.label)
}
