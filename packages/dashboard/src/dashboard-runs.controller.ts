import type { CausalRunStatus, CausalStorageAdapter, ListRunsResult } from '@causal/core';
import { CAUSAL_STORAGE_ADAPTER } from '@causal/nest';
import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  NotImplementedException,
  Param,
  Query,
} from '@nestjs/common';
import { DASHBOARD_MOUNT_PATH } from './constants.js';

interface ListRunsQuery {
  workflowName?: string;
  status?: CausalRunStatus;
  cursor?: string;
  limit?: string;
}

/**
 * Read-only JSON API backing the dashboard's run list/journal views. Reuses
 * the host app's own `CAUSAL_STORAGE_ADAPTER` provider (from `CausalModule`)
 * rather than opening a second connection, so it reflects exactly the same
 * data the live app's engine is operating on.
 */
@Controller(`${DASHBOARD_MOUNT_PATH}/api/runs`)
export class DashboardRunsController {
  constructor(@Inject(CAUSAL_STORAGE_ADAPTER) private readonly storage: CausalStorageAdapter) {}

  @Get()
  async list(@Query() query: ListRunsQuery): Promise<ListRunsResult> {
    if (!this.storage.listRuns) {
      throw new NotImplementedException(
        'The configured CausalStorageAdapter does not implement listRuns() — run browsing is unavailable. ' +
          'See the @causal/dashboard docs for implementing it on a custom adapter.',
      );
    }

    return this.storage.listRuns({
      ...(query.workflowName !== undefined ? { workflowName: query.workflowName } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      ...(query.limit !== undefined ? { limit: Number(query.limit) } : {}),
    });
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const run = await this.storage.getRun(id);
    if (!run) {
      throw new NotFoundException(`No run found with id "${id}"`);
    }
    const events = await this.storage.getEvents(id);
    return { run, events };
  }
}
