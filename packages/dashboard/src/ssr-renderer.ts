import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveDashboardSsrDir } from './runtime-dir.js';
import type { PageData } from './wire-types.js';

interface DashboardSsrModule {
  renderPage(page: PageData): string;
}

/**
 * Renders a page's inner `#app` markup via the frontend's isomorphic React
 * tree (built separately by `vite build --config vite.ssr.config.ts` into
 * `dist/ssr/entry-server.js`). Loaded with a dynamic `import()` of a
 * runtime-computed path — same pattern `@pakiso/example-api`'s
 * `resolveExampleStorage()` uses for its generated Prisma client — so
 * neither tsup nor esbuild try to statically bundle the (React-only) SSR
 * chunk into the backend's own output.
 */
export async function renderDashboardPage(page: PageData): Promise<string> {
  const entryPath = join(resolveDashboardSsrDir(), 'entry-server.js');
  const ssrModule = (await import(pathToFileURL(entryPath).href)) as DashboardSsrModule;
  return ssrModule.renderPage(page);
}
