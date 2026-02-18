import { defineConfig } from 'vite'

export default defineConfig({
  root: './e2e/app',
  server: {
    fs: {
      allow: ['..', '../..'],
    },
  },
})
