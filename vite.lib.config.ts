import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import pkg from './package.json' with { type: 'json' }

const externals = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})]

// Library build: ES module with code-split exporters, every dependency external
// so the consuming app's bundler dedupes and tree-shakes them.
export default defineConfig({
  plugins: [vue()],
  // public/ holds demo-site assets only.
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('./src/lib/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'markdown-viewer.js',
    },
    rollupOptions: {
      external: (id) => externals.some((dep) => id === dep || id.startsWith(`${dep}/`)),
      output: {
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
})
