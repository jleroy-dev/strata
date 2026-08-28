import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 4746, strictPort: true },
  build: { outDir: 'dist', target: 'es2023' },
});
