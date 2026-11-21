import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'renderer'),
  base: './', // critical for file:// loads in production
  server: {
    port: 5173,
    strictPort: true, // so wait-on works reliably
    fs: { allow: [import.meta.dirname] }, // renderer imports ../src/shared
  },
  build: {
    outDir: 'dist', // => renderer/dist
    emptyOutDir: true,
  },
  plugins: [react()],
})
