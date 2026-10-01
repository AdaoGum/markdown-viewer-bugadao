/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Demo site. The library is consumed through the same import path a real
// project would use, aliased to the source so edits hot-reload.
export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@bugadao/markdown-viewer': fileURLToPath(new URL('./src/lib/index.ts', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist-demo',
  },
  test: {
    environment: 'jsdom',
    // Process CSS so ?inline imports (embedded into exports) aren't empty strings.
    css: true,
    include: ['tests/**/*.test.ts'],
  },
})
