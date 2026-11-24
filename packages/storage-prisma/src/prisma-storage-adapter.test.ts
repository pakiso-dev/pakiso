import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ConcurrencyConflictError } from '@causal/core';
import { runStorageConformanceTests } from '@causal/core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../generated/sqlite/index.js';
import { PrismaStorageAdapter } from './prisma-storage-adapter.js';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const dbPath = fileURLToPath(new URL('../generated/sqlite/test.db', import.meta.url));
const databaseUrl = `file:${dbPath}`;

let prisma: PrismaClient;

beforeAll(() => {
  if (existsSync(dbPath)) {
    rmSync(dbPath);
  }
  execFileSync(
    'npx',
    ['prisma', 'db', 'push', '--schema=prisma/sqlite.prisma', '--skip-generate', '--force-reset'],
    { cwd: packageRoot, env: { ...process.env, CAUSAL_DATABASE_URL: databaseUrl }, stdio: 'pipe' },
  );
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
}, 30_000);

afterAll(async () => {
  await prisma.$disconnect();
  if (existsSync(dbPath)) {
    rmSync(dbPath);
  }
});

async function freshAdapter(): Promise<PrismaStorageAdapter> {
  await prisma.causalEvent.deleteMany();
  await prisma.causalRun.deleteMany();
  return new PrismaStorageAdapter(prisma);
}

runStorageConformanceTests({ createAdapter: freshAdapter });

describe('PrismaStorageAdapter (SQLite)', () => {
  it('enforces the expectedSeq optimistic concurrency guard under real concurrent writers', async () => {
    const adapter = await freshAdapter();
    const { run } = await adapter.createOrGetRun({ workflowName: 'wf', input: {} });

    const results = await Promise.allSettled([
      adapter.appendEvent({
        runId: run.id,
        expectedSeq: 0,
        type: 'STEP_COMPLETED',
        stepName: 'a',
        payload: {},
      }),
      adapter.appendEvent({
        runId: run.id,
        expectedSeq: 0,
        type: 'STEP_COMPLETED',
        stepName: 'b',
        payload: {},
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConcurrencyConflictError);

    const events = await adapter.getEvents(run.id);
    expect(events).toHaveLength(1);
  });

  it('persists output as null (Prisma.DbNull) until updateRunStatus sets it', async () => {
    const adapter = await freshAdapter();
    const { run } = await adapter.createOrGetRun({ workflowName: 'wf', input: {} });

    const fetched = await adapter.getRun(run.id);
    expect(fetched?.output).toBeNull();

    const updated = await adapter.updateRunStatus({
      runId: run.id,
      status: 'COMPLETED',
      output: { ok: true },
    });
    expect(updated.output).toEqual({ ok: true });
  });

  it('accepts an explicit null output in updateRunStatus (e.g. a cancelled run)', async () => {
    const adapter = await freshAdapter();
    const { run } = await adapter.createOrGetRun({ workflowName: 'wf', input: {} });

    const updated = await adapter.updateRunStatus({
      runId: run.id,
      status: 'CANCELLED',
      output: null,
    });

    expect(updated.status).toBe('CANCELLED');
    expect(updated.output).toBeNull();
  });

  it('grants a lease when unleased, and rejects a different owner while it is held', async () => {
    const adapter = await freshAdapter();
    const { run } = await adapter.createOrGetRun({ workflowName: 'wf', input: {} });

    const grantedToA = await adapter.acquireLease({
      runId: run.id,
      leaseOwner: 'worker-a',
      leaseDurationMs: 10_000,
    });
    expect(grantedToA).toBe(true);

    const grantedToB = await adapter.acquireLease({
      runId: run.id,
      leaseOwner: 'worker-b',
      leaseDurationMs: 10_000,
    });
    expect(grantedToB).toBe(false);
  });

  it('allows acquiring an expired lease and releasing frees it for another owner', async () => {
    const adapter = await freshAdapter();
    const { run } = await adapter.createOrGetRun({ workflowName: 'wf', input: {} });

    await adapter.acquireLease({ runId: run.id, leaseOwner: 'worker-a', leaseDurationMs: -1 });
    const grantedAfterExpiry = await adapter.acquireLease({
      runId: run.id,
      leaseOwner: 'worker-b',
      leaseDurationMs: 10_000,
    });
    expect(grantedAfterExpiry).toBe(true);

    await adapter.releaseLease({ runId: run.id, leaseOwner: 'worker-b' });
    const grantedAfterRelease = await adapter.acquireLease({
      runId: run.id,
      leaseOwner: 'worker-c',
      leaseDurationMs: 10_000,
    });
    expect(grantedAfterRelease).toBe(true);
  });

  it('releaseLease is a no-op when called by a non-owner', async () => {
    const adapter = await freshAdapter();
    const { run } = await adapter.createOrGetRun({ workflowName: 'wf', input: {} });

    await adapter.acquireLease({ runId: run.id, leaseOwner: 'worker-a', leaseDurationMs: 10_000 });
    await adapter.releaseLease({ runId: run.id, leaseOwner: 'worker-b' });

    const stillHeld = await adapter.acquireLease({
      runId: run.id,
      leaseOwner: 'worker-b',
      leaseDurationMs: 10_000,
    });
    expect(stillHeld).toBe(false);
  });

  it('findExpiredWaitingRuns returns only WAITING_ATTESTATION runs past their deadline', async () => {
    const adapter = await freshAdapter();
    const past = new Date(Date.now() - 1_000);
    const future = new Date(Date.now() + 60_000);

    const { run: overdueRun } = await adapter.createOrGetRun({ workflowName: 'wf', input: {} });
    await adapter.updateRunStatus({
      runId: overdueRun.id,
      status: 'WAITING_ATTESTATION',
      attestationExpiresAt: past,
    });

    const { run: notYetDueRun } = await adapter.createOrGetRun({ workflowName: 'wf', input: {} });
    await adapter.updateRunStatus({
      runId: notYetDueRun.id,
      status: 'WAITING_ATTESTATION',
      attestationExpiresAt: future,
    });

    const { run: noDeadlineRun } = await adapter.createOrGetRun({ workflowName: 'wf', input: {} });
    await adapter.updateRunStatus({ runId: noDeadlineRun.id, status: 'WAITING_ATTESTATION' });

    const expired = await adapter.findExpiredWaitingRuns(new Date());

    expect(expired.map((run) => run.id)).toEqual([overdueRun.id]);
  });

  it('purges completed/failed/cancelled runs older than the cutoff, and their events', async () => {
    const adapter = await freshAdapter();

    const { run: completedRun } = await adapter.createOrGetRun({
      workflowName: 'wf',
      input: {},
      correlationKey: 'order:ORD-1',
      idempotencyKey: 'idem-completed',
    });
    await adapter.appendEvent({
      runId: completedRun.id,
      expectedSeq: 0,
      type: 'WORKFLOW_STARTED',
      payload: {},
    });
    await adapter.updateRunStatus({ runId: completedRun.id, status: 'COMPLETED' });

    const { run: failedRun } = await adapter.createOrGetRun({ workflowName: 'wf', input: {} });
    await adapter.updateRunStatus({ runId: failedRun.id, status: 'FAILED', error: 'boom' });

    const { run: stillRunning } = await adapter.createOrGetRun({ workflowName: 'wf', input: {} });

    // `@updatedAt` is DB-managed, so instead of backdating rows, vary the cutoff
    // relative to "now": a future cutoff includes runs completed just now; a past
    // cutoff excludes them.
    const tooRecentCutoff = new Date(Date.now() - 60_000);
    expect(await adapter.purgeCompletedRunsOlderThan(tooRecentCutoff)).toBe(0);
    expect(await adapter.getRun(completedRun.id)).not.toBeNull();

    const inclusiveCutoff = new Date(Date.now() + 60_000);
    const purgedCount = await adapter.purgeCompletedRunsOlderThan(inclusiveCutoff);

    expect(purgedCount).toBe(2);
    expect(await adapter.getRun(completedRun.id)).toBeNull();
    expect(await adapter.getRun(failedRun.id)).toBeNull();
    expect(await adapter.getEvents(completedRun.id)).toEqual([]);
    expect(await adapter.getLatestRunByCorrelationKey('wf', 'order:ORD-1')).toBeNull();
    // Non-terminal runs are never purged regardless of cutoff.
    expect(await adapter.getRun(stillRunning.id)).not.toBeNull();
  });
});
