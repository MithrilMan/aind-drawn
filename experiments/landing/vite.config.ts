import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  build: {
    outDir: fileURLToPath(new URL('../../dist/experiments/landing', import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    host: '127.0.0.1',
    port: 4174,
  },
});
