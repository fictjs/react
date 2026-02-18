# @fictjs/react

React interoperability layer for [Fict](https://github.com/nicepkg/fict) — embed React components inside Fict applications as controlled islands with SSR, lazy loading, and fine-grained prop reactivity.

## Why

Fict uses its own compiler-driven reactivity model. When you need to reuse an existing React component (a design system, a charting library, a rich text editor), `@fictjs/react` bridges the gap: the React subtree runs in its own React root while the surrounding Fict app feeds it reactive props.

## Features

| Capability | API | When to use |
|---|---|---|
| Eager wrapping | `reactify` | The React component is already imported |
| Declarative island | `ReactIsland` | Inline island with a `props` getter |
| Resumable / lazy | `reactify$` | The component should be lazy-loaded via QRL |
| Static loader | `installReactIslands` | Mount islands from plain HTML attributes (no Fict runtime) |
| Serializable callbacks | `reactAction$` | Pass Fict actions across the serialization boundary |
| Vite preset | `fictReactPreset` | Isolate React JSX transform from Fict's compiler |

## Install

```bash
pnpm add @fictjs/react react react-dom @fictjs/runtime
```

For the Vite preset (optional):

```bash
pnpm add -D @vitejs/plugin-react vite
```

### Requirements

- Node 20+
- React 18.2+ or 19
- `@fictjs/runtime` >= 0.10.0

## Quick Start

### 1. Vite Configuration

If your project mixes Fict and React files, use the preset to scope the React JSX transform to a specific directory (default: `src/react/**`):

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { fictReactPreset } from '@fictjs/react/preset'
import fict from '@fictjs/vite-plugin'

export default defineConfig({
  plugins: [
    fict(),
    ...fictReactPreset(),
  ],
})
```

Custom scope:

```ts
fictReactPreset({
  include: [/components\/react\/.*\.[jt]sx?$/],
})
```

### 2. Wrap a React Component (Eager)

```tsx
import { reactify } from '@fictjs/react'
import { prop } from '@fictjs/runtime'
import { createSignal } from '@fictjs/runtime/advanced'
import { MyButton } from './react/MyButton'

const FictButton = reactify(MyButton)

// In a Fict component
function App() {
  const count = createSignal(0)
  return <FictButton label={prop(() => `Clicked ${count()} times`)} />
}
```

The React component re-renders whenever the reactive props change — without re-running the Fict component function.
If your app uses Fict compiler macros, you can write an equivalent `$state(...)` style.

### 3. Declarative Island

```tsx
import { ReactIsland } from '@fictjs/react'
import { createSignal } from '@fictjs/runtime/advanced'
import { Chart } from './react/Chart'

function Dashboard() {
  const data = createSignal<number[]>([])

  return (
    <ReactIsland
      component={Chart}
      props={() => ({ data: data(), height: 300 })}
      client="visible"
      ssr
    />
  )
}
```

### 4. Lazy-Loaded Island (Resumable)

```ts
import { reactify$ } from '@fictjs/react'

export const LazyChart = reactify$({
  module: import.meta.url,
  export: 'Chart',
  client: 'idle',
  ssr: true,
})
```

The component module is loaded only when the client strategy fires. On the server the optional `component` reference is used for SSR; on the client the QRL triggers a dynamic import.

Serialized props are written to `data-fict-react-props` on the host element, making the island fully resumable from server-rendered HTML.
If lazy module loading fails transiently, `reactify$` retries with bounded exponential backoff (base 100ms, capped at 5s, max 5 failures).

### 5. Static Islands (Loader)

Mount React components from plain HTML without any Fict runtime involvement:

```html
<div
  data-fict-react="./components/Widget.js#Widget"
  data-fict-react-client="visible"
  data-fict-react-props="%7B%22title%22%3A%22Hello%22%7D"
></div>
```

`data-fict-react-props` must contain URL-encoded, serialization-safe data.
For plain HTML authoring, use JSON-compatible primitives/objects/arrays.
For advanced Fict-serialized values (for example action refs), prefer server output produced by `reactify$`/Fict runtime instead of manually crafting attributes.

```ts
import { installReactIslands } from '@fictjs/react/loader'

const cleanup = installReactIslands({
  observe: true,          // Watch for dynamically added islands
  defaultClient: 'idle',  // Fallback client strategy
  visibleRootMargin: '200px',
})

// Later: cleanup() to disconnect observer and unmount all islands
```

The loader uses `MutationObserver` to detect new island hosts and attribute changes. Updating `data-fict-react-props` on a mounted host triggers a React re-render. Changing the QRL (`data-fict-react`) disposes the old root and mounts a fresh one.
When component module loading fails transiently, the loader also retries with the same bounded exponential backoff policy.

### 6. Serializable Actions

Pass callbacks from Fict to React across the serialization boundary:

```ts
import { reactAction$ } from '@fictjs/react'

// In a Fict component
<RemoteEditor
  onSave={reactAction$(import.meta.url, 'handleSave')}
/>
```

```ts
// Same module — the exported handler
export function handleSave(content: string) {
  console.log('Saved:', content)
}
```

Props matching `/^on[A-Z]/` are automatically detected as action refs. For non-standard callback prop names, declare them explicitly:

```ts
const RemoteEditor = reactify$({
  module: import.meta.url,
  export: 'Editor',
  actionProps: ['submitHandler', 'validateFn'],
})
```

## Client Strategies

Control when each island mounts on the client:

| Strategy | Behavior |
|---|---|
| `'load'` | Mount immediately (via microtask). **Default.** |
| `'idle'` | Mount during idle time (`requestIdleCallback`, falls back to `setTimeout(…, 1)`) |
| `'visible'` | Mount when the host element enters the viewport (`IntersectionObserver` with configurable `rootMargin`, default `200px`) |
| `'only'` | Client-only rendering — no SSR, no hydration |

When `ssr` is `true` (the default), the React subtree is rendered to HTML on the server. On the client, the island hydrates (`hydrateRoot`) if SSR content is present, otherwise it creates a fresh root (`createRoot`).

## API Reference

### `reactify<P>(component, options?)`

Wraps a React component as a Fict component. Props flow reactively from the Fict side; the React root updates when props change.

**Options** (`ReactInteropOptions`):

| Option | Type | Default | Description |
|---|---|---|---|
| `ssr` | `boolean` | `true` | Server-side render the React subtree |
| `client` | `ClientDirective` | `'load'` | Client mount strategy |
| `visibleRootMargin` | `string` | `'200px'` | Margin for `'visible'` strategy |
| `identifierPrefix` | `string` | `''` | React `useId` prefix for multi-root pages |
| `actionProps` | `string[]` | `[]` | Additional callback prop names to materialize |

### `ReactIsland<P>(props)`

Declarative island component. Accepts `component`, `props` (value or getter), and all `ReactInteropOptions`.

### `reactify$<P>(options)`

Creates a lazy-loadable Fict component backed by a QRL.

**Additional options** (`ReactifyQrlOptions<P>`):

| Option | Type | Description |
|---|---|---|
| `module` | `string` | Module URL, usually `import.meta.url` |
| `export` | `string` | Export name (default: `'default'`) |
| `component` | `ComponentType<P>` | Optional eager reference for SSR |

### `installReactIslands(options?)`

Scans the document for `[data-fict-react]` hosts and mounts them. Returns a cleanup function.

**Options** (`ReactIslandsLoaderOptions`):

| Option | Type | Default | Description |
|---|---|---|---|
| `document` | `Document` | `document` | Document to scan |
| `selector` | `string` | `'[data-fict-react]'` | CSS selector for island hosts |
| `observe` | `boolean` | `true` | Watch for dynamic additions/removals |
| `defaultClient` | `ClientDirective` | `'load'` | Fallback client strategy |
| `visibleRootMargin` | `string` | `'200px'` | Margin for `'visible'` strategy |

### `reactAction$(moduleId, exportName?)`

Creates a serializable action ref from a module export. The ref is materialized into a callable function when the React component mounts.

### `reactActionFromQrl(qrl)`

Creates an action ref from a raw QRL string.

### `fictReactPreset(options?)`

Returns Vite plugins that scope the React JSX transform to a directory.

| Option | Type | Default | Description |
|---|---|---|---|
| `include` | `FilterPattern` | `[/src\/react\/.*\.[jt]sx?$/]` | Files to transform with React JSX |
| `exclude` | `FilterPattern` | — | Files to exclude |
| `react` | `ReactPluginOptions` | — | Additional `@vitejs/plugin-react` options |

## Host Attributes

When using the loader or resumable mode, the following data attributes control island behavior:

| Attribute | Mutable | Purpose |
|---|---|---|
| `data-fict-react` | `*` | QRL pointing to the React component module |
| `data-fict-react-props` | yes | URL-encoded serialized props |
| `data-fict-react-action-props` | yes | URL-encoded JSON array of custom action prop names |
| `data-fict-react-client` | no | Client strategy (`load` / `idle` / `visible` / `only`) |
| `data-fict-react-ssr` | no | `'1'` if SSR content is present |
| `data-fict-react-prefix` | no | React `useId` identifier prefix |
| `data-fict-react-host` | — | Marks element as a React island host |
| `data-fict-react-mounted` | — | Set to `'1'` after the island mounts |

`*` Changing the QRL disposes the current root and creates a new one.

Immutable attributes (`data-fict-react-client`, `data-fict-react-ssr`, `data-fict-react-prefix`) emit a warning in development if mutated at runtime. To change them, recreate the host element.

## Package Exports

```
@fictjs/react        → Main API (reactify, ReactIsland, reactify$, reactAction$, …)
@fictjs/react/loader → installReactIslands
@fictjs/react/preset → fictReactPreset
```

## Development

```bash
pnpm install
pnpm dev              # Watch mode
pnpm build            # Production build
pnpm test             # Unit tests (vitest)
pnpm test:it          # Integration tests
pnpm test:e2e         # E2E tests (Playwright + Chromium)
pnpm lint             # ESLint
pnpm typecheck        # TypeScript validation
```

## License

[MIT](./LICENSE)
