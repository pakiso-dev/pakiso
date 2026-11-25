import { describe, expect, it } from 'vitest';
import { ConcurrencyConflictError } from '../errors.js';
import type { PakisoStorageAdapter } from '../storage.js';

export interface StorageConformanceOptions {
  /** Factory invoked at the start of each test to produce a fresh adapter instance */
  createAdapter: () => PakisoStorageAdapter | Promise<PakisoStorageAdapter>;
}

/**
 * Reusable Vitest-based conformance suite for any PakisoStorageAdapter
 * implementation (Prisma, Drizzle, TypeORM, DynamoDB, Redis, ...). Modeled on
 * the Keyv `@keyv/test-suite` pattern: adapter authors call this from their
 * own test file, passing a factory that builds a fresh adapter per test.
 *
 * Exported from the `@pakiso/core/testing` subpath — not the main entry
 * point — so `@pakiso/core` itself stays free of a runtime dependency on a
 * test framework.
 */
export function runStorageConformanceTests(options: StorageConformanceOptions): void {
  const { createAdapter } = options;

  describe('PakisoStorageAdapter conformance', () => {
    it('creates a new run with PENDING status', async () => {
      const storage = await createAdapter();
      const { run, created } = await storage.createOrGetRun({
        workflowName: 'order-fulfillment',
        input: { orderId: 'ORD-1' },
      });

      expect(created).toBe(true);
      expect(run.status).toBe('PENDING');
      expect(run.workflowName).toBe('order-fulfillment');
      expect(run.input).toEqual({ orderId: 'ORD-1' });
      expect(run.output).toBeNull();
      expect(run.error).toBeNull();
    });

    it('deduplicates createOrGetRun calls by idempotencyKey', async () => {
      const storage = await createAdapter();
      const first = await storage.createOrGetRun({
        workflowName: 'order-fulfillment',
        input: { orderId: 'ORD-2' },
        idempotencyKey: 'idem-1',
      });
      const second = await storage.createOrGetRun({
        workflowName: 'order-fulfillment',
        input: { orderId: 'ORD-2' },
        idempotencyKey: 'idem-1',
      });

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.run.id).toBe(first.run.id);
    });

    it('retrieves a run by id via getRun', async () => {
      const storage = await createAdapter();
      const { run } = await storage.createOrGetRun({
        workflowName: 'order-fulfillment',
        input: {},
      });

      const fetched = await storage.getRun(run.id);
      expect(fetched?.id).toBe(run.id);
    });

    it('returns null from getRun for an unknown id', async () => {
      const storage = await createAdapter();
      expect(await storage.getRun('does-not-exist')).toBeNull();
    });

    it('returns null from getLatestRunByCorrelationKey for an unknown key', async () => {
      const storage = await createAdapter();
      expect(
        await storage.getLatestRunByCorrelationKey('order-fulfillment', 'order:does-not-exist'),
      ).toBeNull();
    });

    it('finds the latest run by correlationKey', async () => {
      const storage = await createAdapter();
      const { run: first } = await storage.createOrGetRun({
        workflowName: 'order-fulfillment',
        input: {},
        correlationKey: 'order:ORD-3',
      });
      const { run: second } = await storage.createOrGetRun({
        workflowName: 'order-fulfillment',
        input: {},
        correlationKey: 'order:ORD-3',
        idempotencyKey: 'idem-distinct',
      });

      const latest = await storage.getLatestRunByCorrelationKey('order-fulfillment', 'order:ORD-3');
      expect(latest?.id).toBe(second.id);
      expect(latest?.id).not.toBe(first.id);
    });

    it('appends events in ascending seq order starting at 1', async () => {
      const storage = await createAdapter();
      const { run } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });

      const first = await storage.appendEvent({
        runId: run.id,
        expectedSeq: 0,
        type: 'WORKFLOW_STARTED',
        payload: {},
      });
      const second = await storage.appendEvent({
        runId: run.id,
        expectedSeq: 1,
        type: 'STEP_COMPLETED',
        stepName: 'charge-card',
        durationMs: 42,
        payload: { chargeId: 'ch_1' },
      });

      expect(first.seq).toBe(1);
      expect(second.seq).toBe(2);
      expect(second.durationMs).toBe(42);

      const events = await storage.getEvents(run.id);
      expect(events.map((event) => event.seq)).toEqual([1, 2]);
    });

    it('rejects appendEvent when expectedSeq does not match the latest seq', async () => {
      const storage = await createAdapter();
      const { run } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });

      await storage.appendEvent({
        runId: run.id,
        expectedSeq: 0,
        type: 'WORKFLOW_STARTED',
        payload: {},
      });

      await expect(
        storage.appendEvent({
          runId: run.id,
          expectedSeq: 0,
          type: 'STEP_COMPLETED',
          stepName: 'charge-card',
          payload: {},
        }),
      ).rejects.toThrow(ConcurrencyConflictError);
    });

    it('updates run status, output, and error', async () => {
      const storage = await createAdapter();
      const { run } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });

      const updated = await storage.updateRunStatus({
        runId: run.id,
        status: 'COMPLETED',
        output: { ok: true },
      });

      expect(updated.status).toBe('COMPLETED');
      expect(updated.output).toEqual({ ok: true });
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(run.updatedAt.getTime());
    });
  });
}
