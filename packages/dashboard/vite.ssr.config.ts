import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Builds the dashboard's isomorphic React tree for Node-side rendering
 * (frontend/src/entry-server.tsx) into dist/ssr/entry-server.js, loaded at
 * runtime by the backend's ssr-renderer.ts via a dynamic `import()`. Setting
 * `build.ssr` makes Vite externalize node_modules dependencies (react,
 * react-dom/server) instead of bundling them — they're resolved normally
 * from @causal/dashboard's own node_modules at runtime, same as any other
 * backend dependency.
 */
export default defineConfig({
  root: resolve(__dirname, 'frontend'),
  plugins: [react()],
  build: {
    ssr: resolve(__dirname, 'frontend/src/entry-server.tsx'),
    outDir: resolve(__dirname, 'dist/ssr'),
    emptyOutDir: true,
    rollupOptions: {
      output: { entryFileNames: 'entry-server.js' },
    },
  },
});
