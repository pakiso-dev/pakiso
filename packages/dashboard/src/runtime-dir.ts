import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

declare const __dirname: string | undefined;

/**
 * Directory containing this module at runtime, working identically from the
 * tsup-built `dist/index.js` (ESM) / `dist/index.cjs` (CJS) as well as
 * directly from `src/` under Vitest — `__dirname` isn't defined in ESM and
 * `import.meta.url` isn't available in a CJS build, so neither can be used
 * unconditionally.
 */
function currentModuleDir(): string {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  return dirname(fileURLToPath(import.meta.url));
}

/**
 * Walks up from `startDir` to the nearest ancestor containing a
 * `package.json` — i.e. this package's own root, regardless of whether the
 * currently executing module lives in `src/` (tests) or `dist/` (build).
 */
function findPackageRoot(startDir: string): string {
  let dir = startDir;
  while (!existsSync(join(dir, 'package.json'))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('@pakiso/dashboard: could not locate its own package root');
    }
    dir = parent;
  }
  return dir;
}

/** Directory the dashboard's bundled static UI (built by `vite build`) is served from. */
export function resolveDashboardPublicDir(): string {
  return join(findPackageRoot(currentModuleDir()), 'dist', 'public');
}

/** Directory the dashboard's SSR render function (built by `vite build --config vite.ssr.config.ts`) is loaded from. */
export function resolveDashboardSsrDir(): string {
  return join(findPackageRoot(currentModuleDir()), 'dist', 'ssr');
}
