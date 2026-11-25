import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Builds the dashboard's client hydration bundle (frontend/src/entry-client.tsx)
 * into dist/public/assets, bundled alongside the backend's tsup output so
 * the NestJS module can serve it without any runtime dependency on
 * Vite/React itself. No index.html is involved — the HTML document is
 * generated per-request by the backend (see html-shell.ts) around the
 * server-rendered markup, so the client build targets the script entry
 * directly. Filenames are deliberately unhashed since
 * DashboardAssetsController/html-shell.ts serve/reference them from fixed,
 * known paths. See vite.ssr.config.ts for the separate server-rendering build.
 *
 * `@tailwindcss/vite` scans this build's module graph for class usage
 * directly (no `tailwind.config.js`/content globs needed) and compiles
 * `style.css`'s `@import "tailwindcss"` into the final stylesheet.
 */
export default defineConfig({
  root: resolve(__dirname, 'frontend'),
  base: '/pakiso-dashboard/',
  plugins: [tailwindcss(), react()],
  build: {
    outDir: resolve(__dirname, 'dist/public'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'frontend/src/entry-client.tsx'),
      output: {
        entryFileNames: 'assets/main.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (assetInfo) =>
          assetInfo.name?.endsWith('.css') ? 'assets/main.css' : 'assets/[name][extname]',
      },
    },
  },
});
