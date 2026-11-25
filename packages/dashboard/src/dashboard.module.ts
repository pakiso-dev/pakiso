import { Module } from '@nestjs/common';
import { DashboardAssetsController } from './dashboard-assets.controller.js';
import { DashboardPagesController } from './dashboard-pages.controller.js';
import { DashboardRunsController } from './dashboard-runs.controller.js';

/**
 * Mounts a read-only, server-rendered React dashboard (plus the JSON API
 * behind it) for browsing Pakiso runs and their full event journals, under
 * the fixed `pakiso-dashboard` path. Requires `PakisoModule.forRoot()`/
 * `forRootAsync()` to already be registered elsewhere in the app — this
 * module reuses that module's global `PAKISO_STORAGE_ADAPTER` provider
 * rather than configuring its own, so the dashboard always reflects
 * whatever the live app's engine is actually operating on.
 *
 * This module intentionally applies no authentication/authorization of its
 * own, consistent with Pakiso's existing stance that deciding who may
 * inspect/signal runs is the host application's concern (see the
 * [REST control plane docs](https://pakiso.dev/nestjs/rest-control-plane)).
 * Guard it with your own mechanism, e.g. a global guard scoped to the
 * `pakiso-dashboard` prefix, or a reverse-proxy rule.
 */
@Module({
  controllers: [DashboardPagesController, DashboardRunsController, DashboardAssetsController],
})
export class PakisoDashboardModule {}
