import type { CausalRunRecord } from './storage.js';

/**
 * Execution context & replay engine contracts. `CausalContext` is the
 * `AsyncLocalStorage`-backed handle passed to every workflow handler; it
 * brackets side effects (`step()`), suspends for human/policy sign-off
 * (`awaitAttestation()`), and exposes deterministic clock/ID helpers.
 */

export interface StepOptions {
  /** Optional stub value injected during local `causal replay` */
  stubResult?: unknown;
}

export interface AttestationOptions {
  /** Optional timeout/deadline metadata recorded on ATTESTATION_REQUESTED */
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface CausalContext {
  readonly runId: string;
  readonly workflowName: string;
  readonly correlationKey: string | null;
  readonly isReplaying: boolean;

  /**
   * Deterministic, replay-safe side-effect boundary.
   * Automatically measures the wall-clock duration of `fn()` and records it as
   * `durationMs` on the resulting STEP_COMPLETED event. Duration is observability
   * data only — it is never compared during replay and does not affect
   * `CausalDivergenceError` checks.
   */
  step<TResult>(
    stepName: string,
    fn: () => Promise<TResult> | TResult,
    options?: StepOptions,
  ): Promise<TResult>;

  /** Durable human/policy sign-off gate; suspends run until signal arrives */
  awaitAttestation<TPayload = Record<string, unknown>>(
    gateName: string,
    options?: AttestationOptions,
  ): Promise<TPayload>;

  /** Deterministic clock & ID helpers recorded as steps */
  now(): Promise<Date>;
  uuid(): Promise<string>;
}

// biome-ignore lint/suspicious/noExplicitAny: generic handler signature mirrors the documented WorkflowHandler contract and must accept any input/output shape
export type WorkflowHandler<TInput = any, TOutput = any> = (
  input: TInput,
  ctx: CausalContext,
) => Promise<TOutput>;

export interface StartWorkflowParams<TInput = Record<string, unknown>> {
  workflowName: string;
  input: TInput;
  correlationKey?: string;
  idempotencyKey?: string;
}

export interface SignalWorkflowParams<TPayload = Record<string, unknown>> {
  gateName: string;
  payload: TPayload;
}

export interface CausalEngine {
  registerWorkflow(name: string, handler: WorkflowHandler): void;
  startWorkflow<TInput extends Record<string, unknown>>(
    params: StartWorkflowParams<TInput>,
  ): Promise<CausalRunRecord>;
  signalByRunId<TPayload extends Record<string, unknown>>(
    runId: string,
    signal: SignalWorkflowParams<TPayload>,
  ): Promise<void>;
  signalByCorrelationKey<TPayload extends Record<string, unknown>>(
    workflowName: string,
    correlationKey: string,
    signal: SignalWorkflowParams<TPayload>,
  ): Promise<void>;
  replayRun(runId: string, stubs?: Record<string, unknown>): Promise<CausalRunRecord>;
}
