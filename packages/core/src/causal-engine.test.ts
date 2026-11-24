import { describe, expect, it, vi } from 'vitest';
import { getCurrentCausalContext } from './causal-context.js';
import { InProcessCausalEngine } from './causal-engine.js';
import { CausalDivergenceError } from './errors.js';
import { InMemoryStorageAdapter } from './in-memory-storage-adapter.js';
import type { CausalContext } from './runtime.js';

function createEngine() {
  const storage = new InMemoryStorageAdapter();
  const engine = new InProcessCausalEngine({ storage });
  return { storage, engine };
}

describe('InProcessCausalEngine', () => {
  it('runs a workflow to completion, recording steps with durationMs and output', async () => {
    const { storage, engine } = createEngine();
    const chargeCard = vi.fn(async () => ({ chargeId: 'ch_1' }));

    engine.registerWorkflow('checkout', async (input: { orderId: string }, ctx) => {
      const charge = await ctx.step('charge-card', chargeCard);
      return { orderId: input.orderId, chargeId: charge.chargeId };
    });

    const run = await engine.startWorkflow({
      workflowName: 'checkout',
      input: { orderId: 'ORD-1' },
    });

    expect(run.status).toBe('COMPLETED');
    expect(run.output).toEqual({ orderId: 'ORD-1', chargeId: 'ch_1' });
    expect(chargeCard).toHaveBeenCalledTimes(1);

    const events = await storage.getEvents(run.id);
    expect(events.map((e) => e.type)).toEqual([
      'WORKFLOW_STARTED',
      'STEP_COMPLETED',
      'WORKFLOW_COMPLETED',
    ]);
    const stepEvent = events[1];
    expect(stepEvent?.stepName).toBe('charge-card');
    expect(typeof stepEvent?.durationMs).toBe('number');
    expect(stepEvent?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('deduplicates startWorkflow calls sharing an idempotencyKey without re-running the handler', async () => {
    const { engine } = createEngine();
    const handler = vi.fn(async (input: Record<string, unknown>) => input);
    engine.registerWorkflow('wf', handler);

    const first = await engine.startWorkflow({
      workflowName: 'wf',
      input: { a: 1 },
      idempotencyKey: 'idem-1',
    });
    const second = await engine.startWorkflow({
      workflowName: 'wf',
      input: { a: 1 },
      idempotencyKey: 'idem-1',
    });

    expect(second.id).toBe(first.id);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('records a failed run and its error message when the handler throws', async () => {
    const { storage, engine } = createEngine();
    engine.registerWorkflow('wf', async () => {
      throw new Error('boom');
    });

    const run = await engine.startWorkflow({ workflowName: 'wf', input: {} });

    expect(run.status).toBe('FAILED');
    expect(run.error).toBe('boom');

    const events = await storage.getEvents(run.id);
    expect(events.map((e) => e.type)).toEqual(['WORKFLOW_STARTED', 'WORKFLOW_FAILED']);
  });

  it('suspends on awaitAttestation and resumes via signalByRunId without re-running prior steps', async () => {
    const { storage, engine } = createEngine();
    const reserveInventory = vi.fn(async () => ({ reserved: true }));
    const shipOrder = vi.fn(async (approved: boolean) => ({ shipped: approved }));

    engine.registerWorkflow('order', async (input: { orderId: string }, ctx) => {
      await ctx.step('reserve-inventory', reserveInventory);
      const attestation = await ctx.awaitAttestation<{ approved: boolean }>('manager-approval');
      const result = await ctx.step('ship-order', () => shipOrder(attestation.approved));
      return { orderId: input.orderId, ...result };
    });

    const started = await engine.startWorkflow({
      workflowName: 'order',
      input: { orderId: 'ORD-1' },
      correlationKey: 'order:ORD-1',
    });

    expect(started.status).toBe('WAITING_ATTESTATION');
    expect(reserveInventory).toHaveBeenCalledTimes(1);
    expect(shipOrder).not.toHaveBeenCalled();

    await engine.signalByRunId(started.id, {
      gateName: 'manager-approval',
      payload: { approved: true },
    });

    const finished = await storage.getRun(started.id);
    expect(finished?.status).toBe('COMPLETED');
    expect(finished?.output).toEqual({ orderId: 'ORD-1', shipped: true });
    // Re-running the handler from the top on resume must not repeat the already-recorded step.
    expect(reserveInventory).toHaveBeenCalledTimes(1);
    expect(shipOrder).toHaveBeenCalledTimes(1);
  });

  it('resumes a suspended run via signalByCorrelationKey', async () => {
    const { storage, engine } = createEngine();
    engine.registerWorkflow('order', async (_input, ctx) => {
      const attestation = await ctx.awaitAttestation<{ approved: boolean }>('manager-approval');
      return { approved: attestation.approved };
    });

    const started = await engine.startWorkflow({
      workflowName: 'order',
      input: {},
      correlationKey: 'order:ORD-2',
    });
    expect(started.status).toBe('WAITING_ATTESTATION');

    await engine.signalByCorrelationKey('order', 'order:ORD-2', {
      gateName: 'manager-approval',
      payload: { approved: true },
    });

    const finished = await storage.getRun(started.id);
    expect(finished?.status).toBe('COMPLETED');
    expect(finished?.output).toEqual({ approved: true });
  });

  it('rejects signaling the wrong gate name for a suspended run', async () => {
    const { engine } = createEngine();
    engine.registerWorkflow('order', async (_input, ctx) => {
      await ctx.awaitAttestation('manager-approval');
      return {};
    });

    const started = await engine.startWorkflow({ workflowName: 'order', input: {} });

    await expect(
      engine.signalByRunId(started.id, { gateName: 'wrong-gate', payload: {} }),
    ).rejects.toThrow('is not currently awaiting attestation gate "wrong-gate"');
  });

  it('replays a completed run without re-invoking step side effects', async () => {
    const { engine } = createEngine();
    const chargeCard = vi.fn(async () => ({ chargeId: 'ch_1' }));
    engine.registerWorkflow('checkout', async (input: { orderId: string }, ctx) => {
      const charge = await ctx.step('charge-card', chargeCard);
      return { orderId: input.orderId, chargeId: charge.chargeId };
    });

    const run = await engine.startWorkflow({
      workflowName: 'checkout',
      input: { orderId: 'ORD-1' },
    });
    expect(chargeCard).toHaveBeenCalledTimes(1);

    const replayed = await engine.replayRun(run.id);

    expect(replayed.id).toBe(run.id);
    // replay must satisfy every step from the recorded journal, never calling fn() again.
    expect(chargeCard).toHaveBeenCalledTimes(1);
  });

  it('replays a completed run with a step stub override', async () => {
    const { storage, engine } = createEngine();
    engine.registerWorkflow('checkout', async (input: { orderId: string }, ctx) => {
      const charge = await ctx.step('charge-card', async () => ({ chargeId: 'ch_real' }));
      return { orderId: input.orderId, chargeId: charge.chargeId };
    });

    const run = await engine.startWorkflow({
      workflowName: 'checkout',
      input: { orderId: 'ORD-1' },
    });
    expect(run.output).toEqual({ orderId: 'ORD-1', chargeId: 'ch_real' });

    const replayed = await engine.replayRun(run.id, {
      'charge-card': { chargeId: 'ch_stubbed' },
    });

    // The returned record reflects what this replay pass actually produced...
    expect(replayed.output).toEqual({ orderId: 'ORD-1', chargeId: 'ch_stubbed' });
    // ...but the stub must never be persisted back to the real stored run.
    expect((await storage.getRun(run.id))?.output).toEqual({
      orderId: 'ORD-1',
      chargeId: 'ch_real',
    });
  });

  it('replays a still-suspended run cleanly without throwing', async () => {
    const { engine } = createEngine();
    engine.registerWorkflow('order', async (_input, ctx) => {
      await ctx.awaitAttestation('manager-approval');
      return {};
    });

    const run = await engine.startWorkflow({ workflowName: 'order', input: {} });
    expect(run.status).toBe('WAITING_ATTESTATION');

    await expect(engine.replayRun(run.id)).resolves.toMatchObject({
      status: 'WAITING_ATTESTATION',
    });
  });

  it('throws CausalDivergenceError when resumed code calls a different step than recorded', async () => {
    const { storage, engine } = createEngine();
    engine.registerWorkflow('order', async (_input, ctx) => {
      await ctx.awaitAttestation('manager-approval');
      return {};
    });

    const run = await engine.startWorkflow({ workflowName: 'order', input: {} });

    // Simulate a code change: re-register the same workflow name with a step inserted before the gate.
    engine.registerWorkflow('order', async (_input, ctx) => {
      await ctx.step('new-step-not-in-history', async () => 'x');
      await ctx.awaitAttestation('manager-approval');
      return {};
    });

    await expect(engine.replayRun(run.id)).rejects.toThrow(CausalDivergenceError);
    expect((await storage.getRun(run.id))?.status).toBe('WAITING_ATTESTATION');
  });

  it('exposes the active CausalContext via getCurrentCausalContext during step execution', async () => {
    const { engine } = createEngine();
    let observed: CausalContext | undefined;

    engine.registerWorkflow('wf', async (_input, ctx) => {
      await ctx.step('observe', () => {
        observed = getCurrentCausalContext();
      });
      return {};
    });

    expect(getCurrentCausalContext()).toBeUndefined();
    await engine.startWorkflow({ workflowName: 'wf', input: {} });

    expect(observed?.workflowName).toBe('wf');
    expect(getCurrentCausalContext()).toBeUndefined();
  });

  it('records ctx.now()/ctx.uuid() as steps so replay returns identical values without recomputing', async () => {
    const { engine } = createEngine();
    engine.registerWorkflow('wf', async (_input, ctx) => {
      const now = await ctx.now();
      const id = await ctx.uuid();
      return { now: now.toISOString(), id };
    });

    const run = await engine.startWorkflow({ workflowName: 'wf', input: {} });
    const firstOutput = run.output as { now: string; id: string };

    let replayedNow: string | undefined;
    let replayedId: string | undefined;
    engine.registerWorkflow('wf', async (_input, ctx) => {
      const now = await ctx.now();
      const id = await ctx.uuid();
      replayedNow = now.toISOString();
      replayedId = id;
      return { now: replayedNow, id };
    });

    await engine.replayRun(run.id);

    expect(replayedNow).toBe(firstOutput.now);
    expect(replayedId).toBe(firstOutput.id);
  });

  it('resumes past an already-resolved earlier gate when suspended on a second gate', async () => {
    const { storage, engine } = createEngine();
    engine.registerWorkflow('order', async (_input, ctx) => {
      const first = await ctx.awaitAttestation<{ ok: boolean }>('finance-approval');
      const second = await ctx.awaitAttestation<{ ok: boolean }>('manager-approval');
      return { finance: first.ok, manager: second.ok };
    });

    const started = await engine.startWorkflow({ workflowName: 'order', input: {} });
    expect(started.status).toBe('WAITING_ATTESTATION');

    await engine.signalByRunId(started.id, { gateName: 'finance-approval', payload: { ok: true } });
    const afterFirstSignal = await storage.getRun(started.id);
    expect(afterFirstSignal?.status).toBe('WAITING_ATTESTATION');

    await engine.signalByRunId(started.id, { gateName: 'manager-approval', payload: { ok: true } });
    const finished = await storage.getRun(started.id);

    expect(finished?.status).toBe('COMPLETED');
    expect(finished?.output).toEqual({ finance: true, manager: true });
  });

  it('throws CausalDivergenceError replaying a completed run whose code now awaits an extra gate', async () => {
    const { engine } = createEngine();
    engine.registerWorkflow('order', async (_input, ctx) => {
      const attestation = await ctx.awaitAttestation<{ ok: boolean }>('manager-approval');
      return { ok: attestation.ok };
    });

    const started = await engine.startWorkflow({ workflowName: 'order', input: {} });
    await engine.signalByRunId(started.id, { gateName: 'manager-approval', payload: { ok: true } });

    // Simulate a code change: an extra gate added after the one already recorded/completed.
    engine.registerWorkflow('order', async (_input, ctx) => {
      const attestation = await ctx.awaitAttestation<{ ok: boolean }>('manager-approval');
      await ctx.awaitAttestation('new-gate-not-in-history');
      return { ok: attestation.ok };
    });

    await expect(engine.replayRun(started.id)).rejects.toThrow(CausalDivergenceError);
  });

  it('throws CausalDivergenceError replaying a completed run whose code now calls an extra step', async () => {
    const { engine } = createEngine();
    engine.registerWorkflow('wf', async (_input, ctx) => {
      await ctx.step('existing-step', async () => 'a');
      return {};
    });
    const run = await engine.startWorkflow({ workflowName: 'wf', input: {} });

    engine.registerWorkflow('wf', async (_input, ctx) => {
      await ctx.step('existing-step', async () => 'a');
      await ctx.step('new-step-added-later', async () => 'b');
      return {};
    });

    await expect(engine.replayRun(run.id)).rejects.toThrow(CausalDivergenceError);
  });

  it('throws CausalDivergenceError when the awaited gate name itself no longer matches history', async () => {
    const { engine } = createEngine();
    engine.registerWorkflow('order', async (_input, ctx) => {
      await ctx.awaitAttestation('gate-a');
      return {};
    });
    const started = await engine.startWorkflow({ workflowName: 'order', input: {} });
    expect(started.status).toBe('WAITING_ATTESTATION');

    // Simulate a code change renaming the gate while the run is still suspended on the old name.
    engine.registerWorkflow('order', async (_input, ctx) => {
      await ctx.awaitAttestation('gate-b');
      return {};
    });

    await expect(engine.replayRun(started.id)).rejects.toThrow(CausalDivergenceError);
  });

  it('throws when starting an unregistered workflow', async () => {
    const { engine } = createEngine();
    await expect(engine.startWorkflow({ workflowName: 'missing', input: {} })).rejects.toThrow(
      'No workflow registered with name "missing"',
    );
  });

  it('throws when signaling an unknown runId', async () => {
    const { engine } = createEngine();
    await expect(
      engine.signalByRunId('does-not-exist', { gateName: 'g', payload: {} }),
    ).rejects.toThrow('Cannot signal: unknown run "does-not-exist"');
  });

  it('throws when signaling an unknown correlationKey', async () => {
    const { engine } = createEngine();
    await expect(
      engine.signalByCorrelationKey('wf', 'does-not-exist', { gateName: 'g', payload: {} }),
    ).rejects.toThrow(
      'Cannot signal: no run found for workflow "wf" with correlationKey "does-not-exist"',
    );
  });

  it('throws when replaying an unknown runId', async () => {
    const { engine } = createEngine();
    await expect(engine.replayRun('does-not-exist')).rejects.toThrow(
      'Cannot replay: unknown run "does-not-exist"',
    );
  });

  it('rejects signaling a run that is not currently waiting on any attestation', async () => {
    const { engine } = createEngine();
    engine.registerWorkflow('wf', async () => ({}));
    const run = await engine.startWorkflow({ workflowName: 'wf', input: {} });
    expect(run.status).toBe('COMPLETED');

    await expect(engine.signalByRunId(run.id, { gateName: 'g', payload: {} })).rejects.toThrow(
      `expected status "WAITING_ATTESTATION", got "COMPLETED"`,
    );
  });
});

describe('InProcessCausalEngine lease locking', () => {
  it('releases the lease after a run completes, allowing a later pass to acquire it', async () => {
    const { storage, engine } = createEngine();
    engine.registerWorkflow('wf', async () => ({ ok: true }));

    const run = await engine.startWorkflow({ workflowName: 'wf', input: {} });
    expect(run.status).toBe('COMPLETED');

    // If the lease weren't released, a second engine instance couldn't acquire it.
    const granted = await storage.acquireLease({
      runId: run.id,
      leaseOwner: 'another-worker',
      leaseDurationMs: 10_000,
    });
    expect(granted).toBe(true);
  });

  it('releases the lease even when the handler throws', async () => {
    const { storage, engine } = createEngine();
    engine.registerWorkflow('wf', async () => {
      throw new Error('boom');
    });

    const run = await engine.startWorkflow({ workflowName: 'wf', input: {} });
    expect(run.status).toBe('FAILED');

    const granted = await storage.acquireLease({
      runId: run.id,
      leaseOwner: 'another-worker',
      leaseDurationMs: 10_000,
    });
    expect(granted).toBe(true);
  });

  it('throws LeaseConflictError when resuming a run whose lease is held by another worker', async () => {
    const storage = new InMemoryStorageAdapter();
    const engine = new InProcessCausalEngine({ storage, leaseOwner: 'worker-a' });
    engine.registerWorkflow('wf', async (_input, ctx) => {
      await ctx.awaitAttestation('gate');
      return {};
    });

    const started = await engine.startWorkflow({ workflowName: 'wf', input: {} });
    expect(started.status).toBe('WAITING_ATTESTATION');

    // Simulate another replica (worker-b) already processing this exact run's resume.
    await storage.acquireLease({
      runId: started.id,
      leaseOwner: 'worker-b',
      leaseDurationMs: 10_000,
    });

    await expect(
      engine.signalByRunId(started.id, { gateName: 'gate', payload: {} }),
    ).rejects.toThrow('Could not acquire execution lease');
  });
});

describe('InProcessCausalEngine attestation deadlines', () => {
  it('records attestationExpiresAt on the run when a gate has a deadline', async () => {
    const { engine } = createEngine();
    const expiresAt = new Date(Date.now() + 60_000);
    engine.registerWorkflow('wf', async (_input, ctx) => {
      await ctx.awaitAttestation('gate', { expiresAt });
      return {};
    });

    const run = await engine.startWorkflow({ workflowName: 'wf', input: {} });

    expect(run.status).toBe('WAITING_ATTESTATION');
    expect(run.attestationExpiresAt).toEqual(expiresAt);
  });

  it('clears attestationExpiresAt once the gate is signaled', async () => {
    const { storage, engine } = createEngine();
    engine.registerWorkflow('wf', async (_input, ctx) => {
      await ctx.awaitAttestation('gate', { expiresAt: new Date(Date.now() + 60_000) });
      return {};
    });

    const started = await engine.startWorkflow({ workflowName: 'wf', input: {} });
    await engine.signalByRunId(started.id, { gateName: 'gate', payload: {} });

    const finished = await storage.getRun(started.id);
    expect(finished?.status).toBe('COMPLETED');
    expect(finished?.attestationExpiresAt).toBeNull();
  });

  it('expireOverdueAttestations fails runs whose gate deadline has passed', async () => {
    const { storage, engine } = createEngine();
    engine.registerWorkflow('wf', async (_input, ctx) => {
      await ctx.awaitAttestation('manager-approval', { expiresAt: new Date(Date.now() - 1_000) });
      return {};
    });

    const run = await engine.startWorkflow({ workflowName: 'wf', input: {} });
    expect(run.status).toBe('WAITING_ATTESTATION');

    const expired = await engine.expireOverdueAttestations();

    expect(expired).toHaveLength(1);
    expect(expired[0]?.id).toBe(run.id);
    expect(expired[0]?.status).toBe('FAILED');
    expect(expired[0]?.error).toContain('manager-approval');
    expect(expired[0]?.attestationExpiresAt).toBeNull();

    const stored = await storage.getRun(run.id);
    expect(stored?.status).toBe('FAILED');

    const events = await storage.getEvents(run.id);
    expect(events.map((e) => e.type)).toEqual([
      'WORKFLOW_STARTED',
      'ATTESTATION_REQUESTED',
      'WORKFLOW_FAILED',
    ]);
  });

  it('expireOverdueAttestations does not touch runs whose deadline has not yet passed', async () => {
    const { engine } = createEngine();
    engine.registerWorkflow('wf', async (_input, ctx) => {
      await ctx.awaitAttestation('gate', { expiresAt: new Date(Date.now() + 60_000) });
      return {};
    });

    await engine.startWorkflow({ workflowName: 'wf', input: {} });

    expect(await engine.expireOverdueAttestations()).toEqual([]);
  });

  it('skips expiring a run whose lease is already held by another worker', async () => {
    const { storage, engine } = createEngine();
    engine.registerWorkflow('wf', async (_input, ctx) => {
      await ctx.awaitAttestation('gate', { expiresAt: new Date(Date.now() - 1_000) });
      return {};
    });

    const run = await engine.startWorkflow({ workflowName: 'wf', input: {} });
    await storage.acquireLease({
      runId: run.id,
      leaseOwner: 'another-worker',
      leaseDurationMs: 10_000,
    });

    expect(await engine.expireOverdueAttestations()).toEqual([]);
    expect((await storage.getRun(run.id))?.status).toBe('WAITING_ATTESTATION');
  });

  it('returns an empty array when the storage adapter does not support findExpiredWaitingRuns', async () => {
    const storage = new InMemoryStorageAdapter();
    // biome-ignore lint/performance/noDelete: simulating an adapter that genuinely lacks this optional method
    delete (storage as { findExpiredWaitingRuns?: unknown }).findExpiredWaitingRuns;
    const engine = new InProcessCausalEngine({ storage });

    expect(await engine.expireOverdueAttestations()).toEqual([]);
  });
});
