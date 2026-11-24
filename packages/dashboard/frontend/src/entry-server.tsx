import { renderToString } from 'react-dom/server';
import { DashboardApp } from './App.js';
import type { PageData } from './types.js';

/** Called by the backend's `ssr-renderer.ts` via a dynamic `import()` of this built chunk. */
export function renderPage(page: PageData): string {
  return renderToString(<DashboardApp initialPage={page} />);
}
