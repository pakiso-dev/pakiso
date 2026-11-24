import { createReadStream, existsSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { Controller, Get, NotFoundException, Param, StreamableFile } from '@nestjs/common';
import { DASHBOARD_MOUNT_PATH } from './constants.js';
import { mimeTypeForExtension } from './mime-types.js';
import { resolveDashboardPublicDir } from './runtime-dir.js';

/**
 * Serves the dashboard's bundled client hydration bundle + stylesheet
 * (built by `vite build` into `dist/public/assets`, see vite.config.ts) from
 * a fixed, known route. The HTML pages themselves are server-rendered by
 * `DashboardPagesController`, not served from here.
 *
 * Deliberately avoids `@Res()`/platform-specific static-file middleware
 * (e.g. `@nestjs/serve-static`, which assumes Express) so the dashboard
 * works whether the host app runs on Nest's Express or Fastify adapter.
 */
@Controller(DASHBOARD_MOUNT_PATH)
export class DashboardAssetsController {
  @Get('assets/:filename')
  asset(@Param('filename') filename: string): StreamableFile {
    // `basename` strips any directory components an attacker could smuggle
    // in via the route param, so this can never escape the assets directory.
    const relativePath = join('assets', basename(filename));
    const fullPath = join(resolveDashboardPublicDir(), relativePath);
    if (!existsSync(fullPath)) {
      throw new NotFoundException(`Dashboard asset "${relativePath}" not found`);
    }
    return new StreamableFile(createReadStream(fullPath), {
      type: mimeTypeForExtension(extname(fullPath)),
    });
  }
}
