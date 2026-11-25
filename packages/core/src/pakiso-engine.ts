import { randomUUID } from 'node:crypto';
import { SpanStatusCode, context as otelContext, trace } from '@opentelemetry/api';
import { LeaseConflictError, WorkflowSuspendedError } from './errors.js';
import { type PendingSignal, createPakisoContext, runWithPakisoContext } from './pakiso-context.js';
import type {
  PakisoEngine,
  SignalWorkflowParams,
  StartWorkflowParams,
  WorkflowHandler,
} from './runtime.js';
import type { PakisoRunRecord, PakisoStorageAdapter } from './storage.js';

const tracer = trace.getTracer('@pakiso/core');

const DEFAULT_LEASE_DURATION_MS = 30_000;

export interface InProcessPakisoEngineOptions {
  storage: PakisoStorageAdapter;
  /**
   * Identifies this engine instance when acquiring execution leases (e.g. a
   * hostname+pid or a UUID per replica). Defaults to a random UUID generated
   * once per engine instance. Only relevant if `storage` implements
   * `acquireLease`/`releaseLease`.
   */
  leaseOwner?: string;
  /** How long an acquired lease is held before another worker may steal it. Defaults to 30s. */
  leaseDurationMs?: number;
}

interface ExecutionPassOptions {
  allowNewEvents: boolean;
  isReplaying: boolean;
  pendingSignal?: PendingSignal;
}

/**
 * Default PakisoEngine implementation. Executes workflow handlers in-process
 * against a BYOS PakisoStorageAdapter, re-running the handler from the top on
 * every resume — `ctx.step()`/`ctx.awaitAttestation()` short-circuit on
 * already-recorded journal entries so completed side effects are never
 * repeated; only genuinely new work actually executes.
 */
export class InProcessPakisoEngine implements PakisoEngine {
  private readonly storage: PakisoStorageAdapter;
  private readonly handlers = new Map<string, WorkflowHandler>();
  private readonly leaseOwner: string;
  private readonly leaseDurationMs: number;

  constructor(options: InProcessPakisoEngineOptions) {
    this.storage = options.storage;
    this.leaseOwner = options.leaseOwner ?? randomUUID();
    this.leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
  }

  registerWorkflow(name: string, handler: WorkflowHandler): void {
    this.handlers.set(name, handler);
  }

  async startWorkflow<TInput extends Record<string, unknown>>(
    params: StartWorkflowParams<TInput>,
  ): Promise<PakisoRunRecord> {
    const handler = this.requireHandler(params.workflowName);
    const { run, created } = await this.storage.createOrGetRun({
      workflowName: params.workflowName,
      input: params.input,
      ...(params.correlationKey !== undefined ? { correlationKey: params.correlationKey } : {}),
      ...(params.idempotencyKey !== undefined ? { idempotencyKey: params.idempotencyKey } : {}),
    });

    if (!created) {
      return run;
    }

    await this.storage.appendEvent({
      runId: run.id,
      expectedSeq: 0,
      type: 'WORKFLOW_STARTED',
      payload: { input: params.input },
    });
    await this.storage.updateRunStatus({ runId: run.id, status: 'RUNNING' });

    return this.executeRun(run, handler, { allowNewEvents: true, isReplaying: false });
  }

  async signalByRunId<TPayload extends Record<string, unknown>>(
    runId: string,
    signal: SignalWorkflowParams<TPayload>,
  ): Promise<void> {
    const run = await this.storage.getRun(runId);
    if (!run) {
      throw new Error(`Cannot signal: unknown run "${runId}"`);
    }
    await this.resume(run, signal);
  }

  async signalByCorrelationKey<TPayload extends Record<string, unknown>>(
    workflowName: string,
    correlationKey: string,
    signal: SignalWorkflowParams<TPayload>,
  ): Promise<void> {
    const run = await this.storage.getLatestRunByCorrelationKey(workflowName, correlationKey);
    if (!run) {
      throw new Error(
        `Cannot signal: no run found for workflow "${workflowName}" with correlationKey "${correlationKey}"`,
      );
    }
    await this.resume(run, signal);
  }

  async replayRun(runId: string, stubs?: Record<string, unknown>): Promise<PakisoRunRecord> {
    const run = await this.storage.getRun(runId);
    if (!run) {
      throw new Error(`Cannot replay: unknown run "${runId}"`);
    }
    const handler = this.requireHandler(run.workflowName);
    const events = await this.storage.getEvents(run.id);

    const { context } = createPakisoContext({
      runId: run.id,
      workflowName: run.workflowName,
      correlationKey: run.correlationKey,
      events,
      storage: this.storage,
      allowNewEvents: false,
      isReplaying: true,
      ...(stubs !== undefined ? { stubs } : {}),
    });

    const span = tracer.startSpan('pakiso.workflow.replay', {
      attributes: {
        'pakiso.run_id': run.id,
        'pakiso.workflow_name': run.workflowName,
        ...(run.correlationKey ? { 'pakiso.correlation_key': run.correlationKey } : {}),
      },
    });

    try {
      const output = await otelContext.with(trace.setSpan(otelContext.active(), span), () =>
        runWithPakisoContext(context, () => handler(run.input, context)),
      );
      span.setStatus({ code: SpanStatusCode.OK });
      // Reflects what this replay pass actually produced (including any stub
      // overrides) without ever persisting it — replay must never mutate
      // real storage.
      return { ...run, status: 'COMPLETED', output, error: null };
    } catch (error) {
      // A still-suspended run replaying cleanly up to its last recorded gate is expected, not a failure.
      if (error instanceof WorkflowSuspendedError) {
        span.setAttribute('pakiso.suspended', true);
        span.setStatus({ code: SpanStatusCode.OK });
        return { ...run, status: 'WAITING_ATTESTATION' };
      }
      span.recordException(error instanceof Error ? error : String(error));
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Finds every run currently `WAITING_ATTESTATION` whose gate deadline has
   * passed (requires an adapter implementing `findExpiredWaitingRuns`) and
   * fails each one with a clear error, so overdue approvals don't wait
   * forever. Acquires each run's lease first so concurrently running workers
   * don't double-expire the same run; runs whose lease is currently held by
   * another worker are skipped (they're presumably already being handled).
   */
  async expireOverdueAttestations(now: Date = new Date()): Promise<PakisoRunRecord[]> {
    if (!this.storage.findExpiredWaitingRuns) {
      return [];
    }

    const expired = await this.storage.findExpiredWaitingRuns(now);
    const results: PakisoRunRecord[] = [];

    for (const run of expired) {
      const leaseAcquired = await this.acquireLease(run.id);
      if (!leaseAcquired) {
        continue;
      }

      try {
        const events = await this.storage.getEvents(run.id);
        const gateName = events.at(-1)?.stepName ?? '(unknown gate)';
        const message = `Attestation gate "${gateName}" expired at ${run.attestationExpiresAt?.toISOString() ?? now.toISOString()}`;

        await this.storage.appendEvent({
          runId: run.id,
          expectedSeq: events.length,
          type: 'WORKFLOW_FAILED',
          payload: { error: message },
        });
        const updated = await this.storage.updateRunStatus({
          runId: run.id,
          status: 'FAILED',
          error: message,
          attestationExpiresAt: null,
        });
        results.push(updated);
      } finally {
        await this.releaseLease(run.id);
      }
    }

    return results;
  }

  private async resume<TPayload extends Record<string, unknown>>(
    run: PakisoRunRecord,
    signal: SignalWorkflowParams<TPayload>,
  ): Promise<void> {
    if (run.status !== 'WAITING_ATTESTATION') {
      throw new Error(
        `Cannot signal run "${run.id}": expected status "WAITING_ATTESTATION", got "${run.status}"`,
      );
    }

    const events = await this.storage.getEvents(run.id);
    const lastEvent = events.at(-1);
    if (
      !lastEvent ||
      lastEvent.type !== 'ATTESTATION_REQUESTED' ||
      lastEvent.stepName !== signal.gateName
    ) {
      const awaiting = lastEvent?.stepName ? ` (currently awaiting "${lastEvent.stepName}")` : '';
      throw new Error(
        `Run "${run.id}" is not currently awaiting attestation gate "${signal.gateName}"${awaiting}`,
      );
    }

    const handler = this.requireHandler(run.workflowName);
    await this.storage.updateRunStatus({
      runId: run.id,
      status: 'RUNNING',
      attestationExpiresAt: null,
    });

    await this.executeRun(run, handler, {
      allowNewEvents: true,
      isReplaying: false,
      pendingSignal: { gateName: signal.gateName, payload: signal.payload },
    });
  }

  private async executeRun(
    run: PakisoRunRecord,
    handler: WorkflowHandler,
    passOptions: ExecutionPassOptions,
  ): Promise<PakisoRunRecord> {
    const leaseAcquired = await this.acquireLease(run.id);
    if (!leaseAcquired) {
      throw new LeaseConflictError(run.id, this.leaseOwner);
    }

    try {
      return await this.executeRunLocked(run, handler, passOptions);
    } finally {
      await this.releaseLease(run.id);
    }
  }

  private async acquireLease(runId: string): Promise<boolean> {
    if (!this.storage.acquireLease) {
      // Adapter doesn't support distributed leasing (e.g. InMemoryStorageAdapter
      // used for tests/local dev) — proceed without it; single-process callers
      // are safe regardless.
      return true;
    }
    return this.storage.acquireLease({
      runId,
      leaseOwner: this.leaseOwner,
      leaseDurationMs: this.leaseDurationMs,
    });
  }

  private async releaseLease(runId: string): Promise<void> {
    await this.storage.releaseLease?.({ runId, leaseOwner: this.leaseOwner });
  }

  private async executeRunLocked(
    run: PakisoRunRecord,
    handler: WorkflowHandler,
    passOptions: ExecutionPassOptions,
  ): Promise<PakisoRunRecord> {
    const events = await this.storage.getEvents(run.id);
    const { context, getNextExpectedSeq } = createPakisoContext({
      runId: run.id,
      workflowName: run.workflowName,
      correlationKey: run.correlationKey,
      events,
      storage: this.storage,
      ...passOptions,
    });

    const span = tracer.startSpan('pakiso.workflow.execute', {
      attributes: {
        'pakiso.run_id': run.id,
        'pakiso.workflow_name': run.workflowName,
        ...(run.correlationKey ? { 'pakiso.correlation_key': run.correlationKey } : {}),
      },
    });

    try {
      const output = await otelContext.with(trace.setSpan(otelContext.active(), span), () =>
        runWithPakisoContext(context, () => handler(run.input, context)),
      );

      await this.storage.appendEvent({
        runId: run.id,
        expectedSeq: getNextExpectedSeq(),
        type: 'WORKFLOW_COMPLETED',
        payload: { output },
      });
      span.setStatus({ code: SpanStatusCode.OK });
      return await this.storage.updateRunStatus({
        runId: run.id,
        status: 'COMPLETED',
        output,
        attestationExpiresAt: null,
      });
    } catch (error) {
      if (error instanceof WorkflowSuspendedError) {
        span.setAttribute('pakiso.suspended', true);
        span.setStatus({ code: SpanStatusCode.OK });
        return await this.storage.updateRunStatus({
          runId: run.id,
          status: 'WAITING_ATTESTATION',
          attestationExpiresAt: error.expiresAt,
        });
      }

      span.recordException(error instanceof Error ? error : String(error));
      span.setStatus({ code: SpanStatusCode.ERROR });

      const message = error instanceof Error ? error.message : String(error);
      await this.storage.appendEvent({
        runId: run.id,
        expectedSeq: getNextExpectedSeq(),
        type: 'WORKFLOW_FAILED',
        payload: { error: message },
      });
      return await this.storage.updateRunStatus({
        runId: run.id,
        status: 'FAILED',
        error: message,
        attestationExpiresAt: null,
      });
    } finally {
      span.end();
    }
  }

  private requireHandler(workflowName: string): WorkflowHandler {
    const handler = this.handlers.get(workflowName);
    if (!handler) {
      throw new Error(`No workflow registered with name "${workflowName}"`);
    }
    return handler;
  }
}
