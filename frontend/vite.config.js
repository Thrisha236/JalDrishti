import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@seed': fileURLToPath(new URL('../seed', import.meta.url)),
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // The FastAPI backend (uvicorn on port 8000).
    proxy: { '/api': 'http://127.0.0.1:8000' },
    // The seed and shared modules live one level up, outside the frontend folder.
    fs: { allow: [repoRoot] },
  },
});
