import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  build: {
    outDir: fileURLToPath(new URL('../../dist/experiments/playground', import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        atelier: fileURLToPath(new URL('./index.html', import.meta.url)),
        solidFace: fileURLToPath(new URL('./solid-face.html', import.meta.url)),
        solidBuilding: fileURLToPath(new URL('./solid-building.html', import.meta.url)),
        characterCompare: fileURLToPath(new URL('./character-compare.html', import.meta.url)),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
});
