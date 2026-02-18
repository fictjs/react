# @fictjs/react

A React interoperability layer for Fict, based on a controlled React Islands model.

## Features

- `reactify`: Wrap a React component as a Fict component (CSR + SSR).
- `ReactIsland`: Declarative island component with `props` getter support.
- `reactify$`: QRL-serializable React island with lazy loading support.
- `installReactIslands`: Scan and mount `data-fict-react` islands on the client.
- `reactAction$`: Pass Fict QRL actions as serializable React callbacks.
- `fictReactPreset`: Isolate React JSX transform by directory in Vite (default `src/react/**`).

## Install

```bash
pnpm add @fictjs/react react react-dom @fictjs/runtime
```

## Usage

### 1) `reactify` (Eager)

```ts
import { reactify } from '@fictjs/react'
import { prop } from '@fictjs/runtime'

function ReactButton(props: { text: string }) {
  return <button>{props.text}</button>
}

const FictButton = reactify(ReactButton)

// Use in Fict
;<FictButton text={prop(() => state.text)} />
```

### 2) `ReactIsland`

```ts
import { ReactIsland } from '@fictjs/react'

<ReactIsland
  component={ReactButton}
  props={() => ({ text: state.text })}
  client="visible"
  ssr
/>
```

### 3) `reactify$` (Resumable)

```ts
import { reactify$ } from '@fictjs/react'

export const FictButton$ = reactify$({
  module: import.meta.url,
  export: 'ReactButton',
  client: 'idle',
  ssr: true,
})
```

> `reactify$` outputs `data-fict-react` + `data-fict-react-props`, which can be mounted on the client by strategy.

### 4) Client Loader

```ts
import { installReactIslands } from '@fictjs/react'

installReactIslands()
```

`installReactIslands` host attribute constraints:

- Dynamically updatable (triggers refresh): `data-fict-react-props`, `data-fict-react-action-props`
- Immutable after initialization (recreate the island host to apply changes):
  `data-fict-react-client`, `data-fict-react-ssr`, `data-fict-react-prefix`
- Mutable and triggers runtime rebuild: `data-fict-react` (QRL changes cause dispose + remount)
- Runtime mutations of immutable attributes: warning in development, silent ignore in production

### 5) Serializable Callback (Action)

```ts
import { reactAction$ } from '@fictjs/react'

<RemoteReactIsland
  onAction={reactAction$(import.meta.url, 'handleAction')}
/>
```

By default, action refs in callback-like props (`/^on[A-Z]/`) are materialized into callable functions.
If your callback prop is not named like `onX`, declare it explicitly via `actionProps`:

```ts
const RemoteReactIsland = reactify$({
  module: import.meta.url,
  export: 'RemoteReactIsland',
  actionProps: ['submitAction'],
})
```

For loader-based usage, pass this through host attributes:

```html
<div
  data-fict-react="...#RemoteReactIsland"
  data-fict-react-action-props="%5B%22submitAction%22%5D"
></div>
```

### 6) Vite Preset (React Lane)

```ts
import { defineConfig } from 'vite'
import { fictReactPreset } from '@fictjs/react/preset'

export default defineConfig({
  plugins: [
    ...fictReactPreset({
      include: [/src\/react\/.*\.[jt]sx?$/],
    }),
  ],
})
```

## Client Strategies

- `load`: Mount as soon as possible.
- `idle`: Mount when idle (`requestIdleCallback` preferred).
- `visible`: Mount when entering the viewport (`IntersectionObserver`).
- `only`: Client-only rendering (no SSR hydrate).

## Internal Hooks

- `src/testing.ts` provides test injection hooks for this repository only.
- These hooks are internal/unstable, not part of package exports, and not covered by compatibility guarantees.
