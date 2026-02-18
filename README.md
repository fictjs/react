# @fictjs/react

Fict 与 React 的互操作层，采用可控的 React Islands 模型。

## 功能

- `reactify`：把 React 组件包装成 Fict 组件（CSR + SSR）。
- `ReactIsland`：声明式岛屿组件，支持 `props` getter。
- `reactify$`：QRL 可序列化 React 岛屿，支持延迟加载。
- `installReactIslands`：客户端扫描并挂载 `data-fict-react` 岛屿。
- `reactAction$`：把 Fict QRL action 作为可序列化 React callback 传递。
- `fictReactPreset`：Vite 下按目录隔离 React JSX 转换（默认 `src/react/**`）。

## 安装

```bash
pnpm add @fictjs/react react react-dom @fictjs/runtime
```

## 用法

### 1) `reactify`（Eager）

```ts
import { reactify } from '@fictjs/react'
import { prop } from '@fictjs/runtime'

function ReactButton(props: { text: string }) {
  return <button>{props.text}</button>
}

const FictButton = reactify(ReactButton)

// Fict 里使用
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

### 3) `reactify$`（Resumable）

```ts
import { reactify$ } from '@fictjs/react'

export const FictButton$ = reactify$({
  module: import.meta.url,
  export: 'ReactButton',
  client: 'idle',
  ssr: true,
})
```

> `reactify$` 会输出 `data-fict-react` + `data-fict-react-props`，可在客户端按策略加载。

### 4) 客户端 loader

```ts
import { installReactIslands } from '@fictjs/react'

installReactIslands()
```

### 5) 可序列化回调（Action）

```ts
import { reactAction$ } from '@fictjs/react'

<RemoteReactIsland
  onAction={reactAction$(import.meta.url, 'handleAction')}
/>
```

### 6) Vite preset（React lane）

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

## 客户端策略

- `load`：尽快挂载。
- `idle`：空闲时挂载（`requestIdleCallback` 优先）。
- `visible`：进入视口时挂载（`IntersectionObserver`）。
- `only`：仅客户端渲染（不走 SSR hydrate）。
