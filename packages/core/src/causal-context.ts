import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { CausalDivergenceError, WorkflowSuspendedError } from './errors.js';
import type { AttestationOptions, CausalContext, StepOptions } from './runtime.js';
import type { CausalEventRecord, CausalEventType, CausalStorageAdapter } from './storage.js';

const causalContextStorage = new AsyncLocalStorage<CausalContext>();

/**
 * Returns the CausalContext for the workflow run currently executing on this
 * async call stack, if any. Lets deeply nested helpers (e.g. a service method
 * invoked from inside a step's callback) observe `isReplaying`/`runId`
 * without needing `ctx` threaded through every call site explicitly.
 */
export function getCurrentCausalContext(): CausalContext | undefined {
  return causalContextStorage.getStore();
}

/** Runs `fn` with `ctx` bound as the ambient CausalContext for its entire async extent. */
export function runWithCausalContext<T>(ctx: CausalContext, fn: () => Promise<T>): Promise<T> {
  return causalContextStorage.run(ctx, fn);
}

export interface PendingSignal {
  gateName: string;
  payload: Record<string, unknown>;
}

export interface CreateCausalContextOptions {
  runId: string;
  workflowName: string;
  correlationKey: string | null;
  /** Events already recorded for this run, ascending by seq, captured at the start of this pass */
  events: CausalEventRecord[];
  storage: CausalStorageAdapter;
  /**
   * Whether this pass may append brand-new events beyond the captured
   * `events` snapshot. True for live execution (fresh start or resuming
   * after a signal); false for `causal replay`, where anything beyond the
   * recorded journal is a divergence rather than new work.
   */
  allowNewEvents: boolean;
  /** True only for `replayRun()` passes; exposed to workflow authors as `ctx.isReplaying` */
  isReplaying: boolean;
  /** A signal payload resolving a specific in-flight attestation gate, if this pass is a resume */
  pendingSignal?: PendingSignal;
  /** stepName -> override value, applied instead of the recorded result (only consulted during replay) */
  stubs?: Record<string, unknown>;
}

export interface CreatedCausalContext {
  context: CausalContext;
  /** The expectedSeq to use for a terminal WORKFLOW_COMPLETED/WORKFLOW_FAILED event once the handler settles */
  getNextExpectedSeq: () => number;
}

const NOW_STEP_NAME = '__causal_now__';
const UUID_STEP_NAME = '__causal_uuid__';

export function createCausalContext(options: CreateCausalContextOptions): CreatedCausalContext {
  const {
    runId,
    workflowName,
    correlationKey,
    events,
    storage,
    allowNewEvents,
    isReplaying,
    pendingSignal,
    stubs,
  } = options;

  // Mutable cursor into the pre-recorded journal, shared by every ctx method invoked this pass.
  // Only STEP_COMPLETED/ATTESTATION_* events are ctx-method-level entries; WORKFLOW_STARTED and
  // the terminal WORKFLOW_* events are engine-level markers and must not shift step/gate matching.
  const ctxEvents = events.filter(
    (event) =>
      event.type === 'STEP_COMPLETED' ||
      event.type === 'ATTESTATION_REQUESTED' ||
      event.type === 'ATTESTATION_RECEIVED',
  );
  let cursor = 0;
  let nextSeq = events.length;

  async function recordNewEvent(
    type: CausalEventType,
    stepName: string,
    payload: Record<string, unknown>,
    durationMs?: number,
  ): Promise<CausalEventRecord> {
    const event = await storage.appendEvent({
      runId,
      expectedSeq: nextSeq,
      type,
      stepName,
      payload,
      ...(durationMs !== undefined ? { durationMs } : {}),
    });
    nextSeq += 1;
    return event;
  }

  async function step<TResult>(
    stepName: string,
    fn: () => Promise<TResult> | TResult,
    stepOptions?: StepOptions,
  ): Promise<TResult> {
    const recorded = ctxEvents[cursor];
    if (recorded) {
      if (recorded.type !== 'STEP_COMPLETED' || recorded.stepName !== stepName) {
        throw new CausalDivergenceError(
          runId,
          recorded.seq,
          recorded.stepName ?? '(unknown)',
          stepName,
        );
      }
      cursor += 1;

      const override = stubs?.[stepName];
      if (override !== undefined) {
        return override as TResult;
      }
      return recorded.payload.result as TResult;
    }

    if (!allowNewEvents) {
      throw new CausalDivergenceError(runId, nextSeq + 1, '(end of recorded journal)', stepName);
    }

    const stubResult = isReplaying ? stepOptions?.stubResult : undefined;
    const start = performance.now();
    const result = stubResult !== undefined ? (stubResult as TResult) : await fn();
    const durationMs = Math.round(performance.now() - start);

    await recordNewEvent('STEP_COMPLETED', stepName, { result }, durationMs);
    return result;
  }

  async function awaitAttestation<TPayload = Record<string, unknown>>(
    gateName: string,
    attestationOptions?: AttestationOptions,
  ): Promise<TPayload> {
    const requested = ctxEvents[cursor];
    if (requested) {
      if (requested.type !== 'ATTESTATION_REQUESTED' || requested.stepName !== gateName) {
        throw new CausalDivergenceError(
          runId,
          requested.seq,
          requested.stepName ?? '(unknown)',
          gateName,
        );
      }
      cursor += 1;

      const received = ctxEvents[cursor];
      if (received && received.type === 'ATTESTATION_RECEIVED' && received.stepName === gateName) {
        cursor += 1;
        return received.payload as TPayload;
      }

      if (pendingSignal && pendingSignal.gateName === gateName) {
        const event = await recordNewEvent('ATTESTATION_RECEIVED', gateName, pendingSignal.payload);
        return event.payload as TPayload;
      }

      throw new WorkflowSuspendedError(runId, gateName);
    }

    if (!allowNewEvents) {
      throw new CausalDivergenceError(runId, nextSeq + 1, '(end of recorded journal)', gateName);
    }

    await recordNewEvent('ATTESTATION_REQUESTED', gateName, {
      expiresAt: attestationOptions?.expiresAt?.toISOString() ?? null,
      metadata: attestationOptions?.metadata ?? {},
    });
    throw new WorkflowSuspendedError(runId, gateName);
  }

  const context: CausalContext = {
    runId,
    workflowName,
    correlationKey,
    isReplaying,
    step,
    awaitAttestation,
    async now() {
      const iso = await step(NOW_STEP_NAME, () => new Date().toISOString());
      return new Date(iso);
    },
    async uuid() {
      return step(UUID_STEP_NAME, () => randomUUID());
    },
  };

  return { context, getNextExpectedSeq: () => nextSeq };
}
