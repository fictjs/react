#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
PACK_DIR="$TMP_DIR/pack"
SMOKE_DIR="$TMP_DIR/smoke"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$PACK_DIR" "$SMOKE_DIR"

cd "$ROOT_DIR"
TARBALL_PATH="$(pnpm pack --pack-destination "$PACK_DIR" | tail -n 1)"

cat > "$SMOKE_DIR/package.json" <<'JSON'
{
  "name": "fict-react-pack-smoke",
  "private": true,
  "type": "module"
}
JSON

pnpm --dir "$SMOKE_DIR" add "$TARBALL_PATH"
pnpm --dir "$SMOKE_DIR" add @fictjs/runtime@^0.10.0 react@^19.0.0 react-dom@^19.0.0 vite@^7.0.0 @vitejs/plugin-react@^5.0.0
pnpm --dir "$SMOKE_DIR" add -D typescript@^5.9.0 @types/node@^25.0.0

pnpm --dir "$SMOKE_DIR" exec node --input-type=module -e "
  const core = await import('@fictjs/react')
  const loader = await import('@fictjs/react/loader')
  const preset = await import('@fictjs/react/preset')

  if (typeof core.reactify !== 'function') throw new Error('Missing ESM export reactify')
  if (typeof core.reactify$ !== 'function') throw new Error('Missing ESM export reactify$')
  if (typeof loader.installReactIslands !== 'function') throw new Error('Missing ESM export installReactIslands')
  if (typeof preset.fictReactPreset !== 'function') throw new Error('Missing ESM export fictReactPreset')
"

pnpm --dir "$SMOKE_DIR" exec node -e "
  const core = require('@fictjs/react')
  const loader = require('@fictjs/react/loader')
  const preset = require('@fictjs/react/preset')

  if (typeof core.reactify !== 'function') throw new Error('Missing CJS export reactify')
  if (typeof core.reactify$ !== 'function') throw new Error('Missing CJS export reactify$')
  if (typeof loader.installReactIslands !== 'function') throw new Error('Missing CJS export installReactIslands')
  if (typeof preset.fictReactPreset !== 'function') throw new Error('Missing CJS export fictReactPreset')
"

cat > "$SMOKE_DIR/tsconfig.json" <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["smoke.ts"]
}
JSON

cat > "$SMOKE_DIR/smoke.ts" <<'TS'
import { type MountReactRootOptions, type MountedReactRoot, reactify, reactify$ } from '@fictjs/react'
import { installReactIslands } from '@fictjs/react/loader'
import { fictReactPreset, type FictReactPresetOptions } from '@fictjs/react/preset'

type _Compat1 = MountReactRootOptions

type _Compat2 = MountedReactRoot

const _opts: FictReactPresetOptions = {}

if (typeof reactify !== 'function') {
  throw new Error('reactify type/runtime mismatch')
}

if (typeof reactify$ !== 'function') {
  throw new Error('reactify$ type/runtime mismatch')
}

if (typeof installReactIslands !== 'function') {
  throw new Error('installReactIslands type/runtime mismatch')
}

if (typeof fictReactPreset !== 'function') {
  throw new Error('fictReactPreset type/runtime mismatch')
}

void _opts
TS

pnpm --dir "$SMOKE_DIR" exec tsc -p "$SMOKE_DIR/tsconfig.json"
