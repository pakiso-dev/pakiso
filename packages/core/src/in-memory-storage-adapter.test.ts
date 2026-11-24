import { describe, expect, it } from 'vitest';
import { InMemoryStorageAdapter } from './in-memory-storage-adapter.js';

describe('InMemoryStorageAdapter', () => {
  it('rejects appendEvent for an unknown runId', async () => {
    const storage = new InMemoryStorageAdapter();

    await expect(
      storage.appendEvent({
        runId: 'does-not-exist',
        expectedSeq: 0,
        type: 'WORKFLOW_STARTED',
        payload: {},
      }),
    ).rejects.toThrow('Cannot append event: unknown run "does-not-exist"');
  });

  it('rejects updateRunStatus for an unknown runId', async () => {
    const storage = new InMemoryStorageAdapter();

    await expect(
      storage.updateRunStatus({
        runId: 'does-not-exist',
        status: 'COMPLETED',
      }),
    ).rejects.toThrow('Cannot update status: unknown run "does-not-exist"');
  });
});

describe('InMemoryStorageAdapter.findExpiredWaitingRuns', () => {
  it('finds only WAITING_ATTESTATION runs with a past attestationExpiresAt', async () => {
    const storage = new InMemoryStorageAdapter();
    const past = new Date(Date.now() - 1_000);
    const future = new Date(Date.now() + 60_000);

    const { run: overdueRun } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });
    await storage.updateRunStatus({
      runId: overdueRun.id,
      status: 'WAITING_ATTESTATION',
      attestationExpiresAt: past,
    });

    const { run: notYetDueRun } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });
    await storage.updateRunStatus({
      runId: notYetDueRun.id,
      status: 'WAITING_ATTESTATION',
      attestationExpiresAt: future,
    });

    const { run: noDeadlineRun } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });
    await storage.updateRunStatus({ runId: noDeadlineRun.id, status: 'WAITING_ATTESTATION' });

    const { run: completedRun } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });
    await storage.updateRunStatus({
      runId: completedRun.id,
      status: 'COMPLETED',
      attestationExpiresAt: past,
    });

    const expired = await storage.findExpiredWaitingRuns(new Date());

    expect(expired.map((run) => run.id)).toEqual([overdueRun.id]);
  });
});
