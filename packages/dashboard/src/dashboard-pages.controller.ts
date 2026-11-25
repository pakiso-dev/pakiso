import { Controller, Get, Header, Inject, Param, Query } from '@nestjs/common';
import type { PakisoRunStatus, PakisoStorageAdapter } from '@pakiso/core';
import { PAKISO_STORAGE_ADAPTER } from '@pakiso/nest';
import { DASHBOARD_MOUNT_PATH } from './constants.js';
import { renderHtmlShell } from './html-shell.js';
import { toWireEvent, toWireRun } from './serialize-run.js';
import { renderDashboardPage } from './ssr-renderer.js';
import type { ListRunsFilter, PageData } from './wire-types.js';

interface ListRunsQuery {
  workflowName?: string;
  status?: PakisoRunStatus;
  cursor?: string;
}

/**
 * Server-renders the dashboard's two pages (run list, run detail) as full
 * HTML documents — real page loads/links/forms work with JavaScript
 * disabled, and `entry-client.tsx` hydrates the same markup for fast
 * client-side navigation afterwards. Fetches data directly from the
 * injected storage adapter rather than calling `DashboardRunsController`'s
 * JSON API over HTTP (that API still exists separately, for the client
 * bundle's post-hydration navigation and any other programmatic consumer).
 *
 * Both routes always respond `200` even when a run isn't found or the
 * storage adapter doesn't support `listRuns()` — they render a
 * human-readable in-page message for that case instead. Use
 * `DashboardRunsController`'s JSON API if you need real `404`/`501` status
 * codes for a programmatic caller.
 */
@Controller(DASHBOARD_MOUNT_PATH)
export class DashboardPagesController {
  constructor(@Inject(PAKISO_STORAGE_ADAPTER) private readonly storage: PakisoStorageAdapter) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async list(@Query() query: ListRunsQuery): Promise<string> {
    const filter: ListRunsFilter = {
      ...(query.workflowName ? { workflowName: query.workflowName } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    let page: PageData;
    if (!this.storage.listRuns) {
      page = { type: 'list', runs: [], nextCursor: null, filter, unsupported: true };
    } else {
      const result = await this.storage.listRuns({
        ...filter,
        ...(query.cursor ? { cursor: query.cursor } : {}),
      });
      page = {
        type: 'list',
        runs: result.runs.map(toWireRun),
        nextCursor: result.nextCursor,
        filter,
      };
    }

    return renderHtmlShell(await renderDashboardPage(page), page);
  }

  @Get('runs/:id')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async detail(@Param('id') id: string): Promise<string> {
    const run = await this.storage.getRun(id);
    const page: PageData = run
      ? {
          type: 'detail',
          run: toWireRun(run),
          events: (await this.storage.getEvents(id)).map(toWireEvent),
        }
      : { type: 'not-found', runId: id };

    return renderHtmlShell(await renderDashboardPage(page), page);
  }
}
