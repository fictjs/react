import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/loader.ts', 'src/preset.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  minify: false,
  external: [
    '@fictjs/runtime',
    '@fictjs/runtime/internal',
    '@vitejs/plugin-react',
    'react',
    'react-dom',
    'react-dom/client',
    'react-dom/server',
    'vite',
  ],
})
