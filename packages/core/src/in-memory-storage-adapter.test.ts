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

describe('InMemoryStorageAdapter.purgeCompletedRunsOlderThan', () => {
  it('purges only terminal runs updated at or before the cutoff, and their events', async () => {
    const storage = new InMemoryStorageAdapter();
    const cutoff = new Date('2024-06-01T00:00:00.000Z');

    const { run: oldCompleted } = await storage.createOrGetRun({
      workflowName: 'wf',
      input: {},
      correlationKey: 'order:ORD-1',
      idempotencyKey: 'idem-old',
    });
    await storage.appendEvent({
      runId: oldCompleted.id,
      expectedSeq: 0,
      type: 'WORKFLOW_STARTED',
      payload: {},
    });
    const purgedRun = await storage.updateRunStatus({
      runId: oldCompleted.id,
      status: 'COMPLETED',
    });
    // Force updatedAt before the cutoff (bypassing the adapter's own "now" timestamping).
    Object.assign(purgedRun, { updatedAt: new Date('2024-01-01T00:00:00.000Z') });

    const { run: recentCompleted } = await storage.createOrGetRun({
      workflowName: 'wf',
      input: {},
    });
    await storage.updateRunStatus({ runId: recentCompleted.id, status: 'COMPLETED' });

    const { run: stillRunning } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });

    const purgedCount = await storage.purgeCompletedRunsOlderThan(cutoff);

    expect(purgedCount).toBe(1);
    expect(await storage.getRun(oldCompleted.id)).toBeNull();
    expect(await storage.getEvents(oldCompleted.id)).toEqual([]);
    expect(await storage.getLatestRunByCorrelationKey('wf', 'order:ORD-1')).toBeNull();
    expect(await storage.getRun(recentCompleted.id)).not.toBeNull();
    expect(await storage.getRun(stillRunning.id)).not.toBeNull();

    // The idempotencyKey index entry was cleaned up too — a repeat create with the
    // same key now creates a brand-new run instead of resurrecting the purged one.
    const { created } = await storage.createOrGetRun({
      workflowName: 'wf',
      input: {},
      idempotencyKey: 'idem-old',
    });
    expect(created).toBe(true);
  });

  it('never purges non-terminal runs regardless of age', async () => {
    const storage = new InMemoryStorageAdapter();
    const { run } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });
    await storage.updateRunStatus({ runId: run.id, status: 'WAITING_ATTESTATION' });

    const purgedCount = await storage.purgeCompletedRunsOlderThan(new Date(Date.now() + 1_000_000));

    expect(purgedCount).toBe(0);
    expect(await storage.getRun(run.id)).not.toBeNull();
  });
});
