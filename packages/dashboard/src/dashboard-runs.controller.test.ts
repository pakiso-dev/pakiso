import { NotFoundException, NotImplementedException } from '@nestjs/common';
import type { PakisoStorageAdapter } from '@pakiso/core';
import { InMemoryStorageAdapter } from '@pakiso/core';
import { describe, expect, it } from 'vitest';
import { DashboardRunsController } from './dashboard-runs.controller.js';

describe('DashboardRunsController', () => {
  it('lists runs via storage.listRuns, forwarding filters/cursor/limit', async () => {
    const storage = new InMemoryStorageAdapter();
    const { run: first } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });
    const { run: second } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });
    await storage.updateRunStatus({ runId: second.id, status: 'COMPLETED' });

    const controller = new DashboardRunsController(storage);

    const all = await controller.list({ workflowName: 'wf' });
    expect(all.runs.map((run) => run.id).sort()).toEqual([first.id, second.id].sort());

    const completedOnly = await controller.list({ workflowName: 'wf', status: 'COMPLETED' });
    expect(completedOnly.runs.map((run) => run.id)).toEqual([second.id]);

    const limited = await controller.list({ limit: '1' });
    expect(limited.runs).toHaveLength(1);
  });

  it('throws NotImplementedException when the adapter does not implement listRuns', async () => {
    // A minimal adapter satisfying PakisoStorageAdapter without listRuns —
    // simulates a custom BYOS adapter that never implemented the optional method.
    const storageWithoutListRuns: PakisoStorageAdapter = {
      async createOrGetRun(params) {
        return {
          run: {
            id: 'run-1',
            workflowName: params.workflowName,
            correlationKey: null,
            idempotencyKey: null,
            status: 'PENDING',
            input: params.input,
            output: null,
            error: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            attestationExpiresAt: null,
          },
          created: true,
        };
      },
      async getRun() {
        return null;
      },
      async getLatestRunByCorrelationKey() {
        return null;
      },
      async getEvents() {
        return [];
      },
      async appendEvent() {
        throw new Error('not used in this test');
      },
      async updateRunStatus() {
        throw new Error('not used in this test');
      },
    };
    const controller = new DashboardRunsController(storageWithoutListRuns);

    await expect(controller.list({})).rejects.toThrow(NotImplementedException);
  });

  it('returns run metadata + full event journal for a known run id', async () => {
    const storage = new InMemoryStorageAdapter();
    const { run } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });
    await storage.appendEvent({
      runId: run.id,
      expectedSeq: 0,
      type: 'WORKFLOW_STARTED',
      payload: {},
    });
    const controller = new DashboardRunsController(storage);

    const detail = await controller.detail(run.id);

    expect(detail.run.id).toBe(run.id);
    expect(detail.events).toHaveLength(1);
    expect(detail.events[0]?.type).toBe('WORKFLOW_STARTED');
  });

  it('throws NotFoundException for an unknown run id', async () => {
    const storage = new InMemoryStorageAdapter();
    const controller = new DashboardRunsController(storage);

    await expect(controller.detail('does-not-exist')).rejects.toThrow(NotFoundException);
  });
});
