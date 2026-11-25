import { DASHBOARD_MOUNT_PATH } from './constants.js';
import type { PageData } from './wire-types.js';

/**
 * Wraps SSR-rendered inner markup in the full HTML document: the client
 * hydration bundle, the bundled stylesheet, and the same `page` data
 * embedded as JSON so `entry-client.tsx` can `hydrateRoot()` against
 * identical props rather than re-fetching on first load.
 */
export function renderHtmlShell(innerHtml: string, page: PageData): string {
  // Escaping `<` prevents a `payload`/`input` value containing the literal
  // string "</script>" from prematurely closing this embedded data script.
  const embeddedJson = JSON.stringify(page).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pakiso Dashboard</title>
    <link rel="stylesheet" href="/${DASHBOARD_MOUNT_PATH}/assets/main.css" />
  </head>
  <body>
    <div id="app">${innerHtml}</div>
    <script id="__PAKISO_DASHBOARD_DATA__" type="application/json">${embeddedJson}</script>
    <script type="module" src="/${DASHBOARD_MOUNT_PATH}/assets/main.js"></script>
  </body>
</html>
`;
}
