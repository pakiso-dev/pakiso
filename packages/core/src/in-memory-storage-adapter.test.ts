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

describe('InMemoryStorageAdapter.listRuns', () => {
  it('orders runs most-recently-created first, filtered by workflowName and status', async () => {
    const storage = new InMemoryStorageAdapter();

    const { run: oldestOtherWorkflow } = await storage.createOrGetRun({
      workflowName: 'other-wf',
      input: {},
    });
    Object.assign(oldestOtherWorkflow, { createdAt: new Date('2024-01-01T00:00:00.000Z') });

    const { run: oldest } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });
    Object.assign(oldest, { createdAt: new Date('2024-01-02T00:00:00.000Z') });
    await storage.updateRunStatus({ runId: oldest.id, status: 'COMPLETED' });

    const { run: middle } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });
    Object.assign(middle, { createdAt: new Date('2024-01-03T00:00:00.000Z') });
    await storage.updateRunStatus({ runId: middle.id, status: 'WAITING_ATTESTATION' });

    const { run: newest } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });
    Object.assign(newest, { createdAt: new Date('2024-01-04T00:00:00.000Z') });
    await storage.updateRunStatus({ runId: newest.id, status: 'WAITING_ATTESTATION' });

    const allForWorkflow = await storage.listRuns({ workflowName: 'wf' });
    expect(allForWorkflow.runs.map((run) => run.id)).toEqual([newest.id, middle.id, oldest.id]);
    expect(allForWorkflow.nextCursor).toBeNull();

    const waitingOnly = await storage.listRuns({
      workflowName: 'wf',
      status: 'WAITING_ATTESTATION',
    });
    expect(waitingOnly.runs.map((run) => run.id)).toEqual([newest.id, middle.id]);
  });

  it('paginates via cursor, respecting limit', async () => {
    const storage = new InMemoryStorageAdapter();

    const { run: oldest } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });
    Object.assign(oldest, { createdAt: new Date(2024, 0, 1) });
    const { run: middle } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });
    Object.assign(middle, { createdAt: new Date(2024, 0, 2) });
    const { run: newest } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });
    Object.assign(newest, { createdAt: new Date(2024, 0, 3) });

    const firstPage = await storage.listRuns({ limit: 2 });
    expect(firstPage.runs.map((run) => run.id)).toEqual([newest.id, middle.id]);
    expect(firstPage.nextCursor).toBe(middle.id);

    const secondPage = await storage.listRuns({
      limit: 2,
      ...(firstPage.nextCursor !== null ? { cursor: firstPage.nextCursor } : {}),
    });
    expect(secondPage.runs.map((run) => run.id)).toEqual([oldest.id]);
    expect(secondPage.nextCursor).toBeNull();
  });
});
