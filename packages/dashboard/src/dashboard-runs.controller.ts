import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  NotImplementedException,
  Param,
  Query,
} from '@nestjs/common';
import type { ListRunsResult, PakisoRunStatus, PakisoStorageAdapter } from '@pakiso/core';
import { PAKISO_STORAGE_ADAPTER } from '@pakiso/nest';
import { DASHBOARD_MOUNT_PATH } from './constants.js';

interface ListRunsQuery {
  workflowName?: string;
  status?: PakisoRunStatus;
  cursor?: string;
  limit?: string;
}

/**
 * Read-only JSON API backing the dashboard's run list/journal views. Reuses
 * the host app's own `PAKISO_STORAGE_ADAPTER` provider (from `PakisoModule`)
 * rather than opening a second connection, so it reflects exactly the same
 * data the live app's engine is operating on.
 */
@Controller(`${DASHBOARD_MOUNT_PATH}/api/runs`)
export class DashboardRunsController {
  constructor(@Inject(PAKISO_STORAGE_ADAPTER) private readonly storage: PakisoStorageAdapter) {}

  @Get()
  async list(@Query() query: ListRunsQuery): Promise<ListRunsResult> {
    if (!this.storage.listRuns) {
      throw new NotImplementedException(
        'The configured PakisoStorageAdapter does not implement listRuns() — run browsing is unavailable. ' +
          'See the @pakiso/dashboard docs for implementing it on a custom adapter.',
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
