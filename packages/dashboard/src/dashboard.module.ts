import { Module } from '@nestjs/common';
import { DashboardAssetsController } from './dashboard-assets.controller.js';
import { DashboardPagesController } from './dashboard-pages.controller.js';
import { DashboardRunsController } from './dashboard-runs.controller.js';

/**
 * Mounts a read-only, server-rendered React dashboard (plus the JSON API
 * behind it) for browsing Causal runs and their full event journals, under
 * the fixed `causal-dashboard` path. Requires `CausalModule.forRoot()`/
 * `forRootAsync()` to already be registered elsewhere in the app — this
 * module reuses that module's global `CAUSAL_STORAGE_ADAPTER` provider
 * rather than configuring its own, so the dashboard always reflects
 * whatever the live app's engine is actually operating on.
 *
 * This module intentionally applies no authentication/authorization of its
 * own, consistent with Causal's existing stance that deciding who may
 * inspect/signal runs is the host application's concern (see the
 * [REST control plane docs](https://causal.dev/nestjs/rest-control-plane)).
 * Guard it with your own mechanism, e.g. a global guard scoped to the
 * `causal-dashboard` prefix, or a reverse-proxy rule.
 */
@Module({
  controllers: [DashboardPagesController, DashboardRunsController, DashboardAssetsController],
})
export class CausalDashboardModule {}
