import { type PendingSignal, createCausalContext, runWithCausalContext } from './causal-context.js';
import { WorkflowSuspendedError } from './errors.js';
import type {
  CausalEngine,
  SignalWorkflowParams,
  StartWorkflowParams,
  WorkflowHandler,
} from './runtime.js';
import type { CausalRunRecord, CausalStorageAdapter } from './storage.js';

export interface InProcessCausalEngineOptions {
  storage: CausalStorageAdapter;
}

interface ExecutionPassOptions {
  allowNewEvents: boolean;
  isReplaying: boolean;
  pendingSignal?: PendingSignal;
}

/**
 * Default CausalEngine implementation. Executes workflow handlers in-process
 * against a BYOS CausalStorageAdapter, re-running the handler from the top on
 * every resume — `ctx.step()`/`ctx.awaitAttestation()` short-circuit on
 * already-recorded journal entries so completed side effects are never
 * repeated; only genuinely new work actually executes.
 */
export class InProcessCausalEngine implements CausalEngine {
  private readonly storage: CausalStorageAdapter;
  private readonly handlers = new Map<string, WorkflowHandler>();

  constructor(options: InProcessCausalEngineOptions) {
    this.storage = options.storage;
  }

  registerWorkflow(name: string, handler: WorkflowHandler): void {
    this.handlers.set(name, handler);
  }

  async startWorkflow<TInput extends Record<string, unknown>>(
    params: StartWorkflowParams<TInput>,
  ): Promise<CausalRunRecord> {
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

  async replayRun(runId: string, stubs?: Record<string, unknown>): Promise<CausalRunRecord> {
    const run = await this.storage.getRun(runId);
    if (!run) {
      throw new Error(`Cannot replay: unknown run "${runId}"`);
    }
    const handler = this.requireHandler(run.workflowName);
    const events = await this.storage.getEvents(run.id);

    const { context } = createCausalContext({
      runId: run.id,
      workflowName: run.workflowName,
      correlationKey: run.correlationKey,
      events,
      storage: this.storage,
      allowNewEvents: false,
      isReplaying: true,
      ...(stubs !== undefined ? { stubs } : {}),
    });

    try {
      const output = await runWithCausalContext(context, () => handler(run.input, context));
      // Reflects what this replay pass actually produced (including any stub
      // overrides) without ever persisting it — replay must never mutate
      // real storage.
      return { ...run, status: 'COMPLETED', output, error: null };
    } catch (error) {
      // A still-suspended run replaying cleanly up to its last recorded gate is expected, not a failure.
      if (error instanceof WorkflowSuspendedError) {
        return { ...run, status: 'WAITING_ATTESTATION' };
      }
      throw error;
    }
  }

  private async resume<TPayload extends Record<string, unknown>>(
    run: CausalRunRecord,
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
    await this.storage.updateRunStatus({ runId: run.id, status: 'RUNNING' });

    await this.executeRun(run, handler, {
      allowNewEvents: true,
      isReplaying: false,
      pendingSignal: { gateName: signal.gateName, payload: signal.payload },
    });
  }

  private async executeRun(
    run: CausalRunRecord,
    handler: WorkflowHandler,
    passOptions: ExecutionPassOptions,
  ): Promise<CausalRunRecord> {
    const events = await this.storage.getEvents(run.id);
    const { context, getNextExpectedSeq } = createCausalContext({
      runId: run.id,
      workflowName: run.workflowName,
      correlationKey: run.correlationKey,
      events,
      storage: this.storage,
      ...passOptions,
    });

    try {
      const output = await runWithCausalContext(context, () => handler(run.input, context));

      await this.storage.appendEvent({
        runId: run.id,
        expectedSeq: getNextExpectedSeq(),
        type: 'WORKFLOW_COMPLETED',
        payload: { output },
      });
      return await this.storage.updateRunStatus({ runId: run.id, status: 'COMPLETED', output });
    } catch (error) {
      if (error instanceof WorkflowSuspendedError) {
        return await this.storage.updateRunStatus({ runId: run.id, status: 'WAITING_ATTESTATION' });
      }

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
      });
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
