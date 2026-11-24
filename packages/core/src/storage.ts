/**
 * BYOS (Bring-Your-Own-Storage) contract. The core runtime owns execution
 * semantics while delegating persistence to this adapter interface, so any
 * database (Prisma, Drizzle, TypeORM, DynamoDB, Redis, ...) can back a
 * Causal run as long as it satisfies these guarantees.
 */

export type CausalRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'WAITING_ATTESTATION'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type CausalEventType =
  | 'WORKFLOW_STARTED'
  | 'STEP_COMPLETED'
  | 'ATTESTATION_REQUESTED'
  | 'ATTESTATION_RECEIVED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_FAILED'
  | 'WORKFLOW_CANCELLED';

export interface CausalRunRecord<
  TInput = Record<string, unknown>,
  TOutput = Record<string, unknown>,
> {
  id: string;
  workflowName: string;
  correlationKey: string | null;
  idempotencyKey: string | null;
  status: CausalRunStatus;
  input: TInput;
  output: TOutput | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Deadline for the attestation gate currently being awaited (Phase 4: auto-
   * escalation), set when `status` transitions to `WAITING_ATTESTATION` via
   * `AttestationOptions.expiresAt`. Null when not awaiting a deadlined gate.
   */
  attestationExpiresAt: Date | null;
}

export interface CausalEventRecord<TPayload = Record<string, unknown>> {
  id: string;
  runId: string;
  seq: number;
  type: CausalEventType;
  stepName: string | null;
  /** Wall-clock execution time in milliseconds for STEP_COMPLETED events; null for all other event types */
  durationMs: number | null;
  payload: TPayload;
  createdAt: Date;
}

export interface CreateRunParams {
  workflowName: string;
  input: Record<string, unknown>;
  correlationKey?: string;
  idempotencyKey?: string;
}

export interface AppendEventParams {
  runId: string;
  /** Optimistic concurrency guard: adapter MUST reject if latest seq !== expectedSeq */
  expectedSeq: number;
  type: CausalEventType;
  stepName?: string;
  /** Wall-clock execution time in milliseconds, measured by ctx.step() around fn() */
  durationMs?: number;
  payload: Record<string, unknown>;
}

export interface UpdateRunStatusParams {
  runId: string;
  status: CausalRunStatus;
  output?: Record<string, unknown> | null;
  error?: string | null;
  /** Set alongside a transition to WAITING_ATTESTATION when the gate has a deadline; cleared (null) otherwise */
  attestationExpiresAt?: Date | null;
}

export interface AcquireLeaseParams {
  runId: string;
  /** Identifies the worker/replica attempting to acquire the lease (e.g. hostname+pid or a UUID) */
  leaseOwner: string;
  /** How long the lease is held before it's considered expired and stealable by another owner */
  leaseDurationMs: number;
}

export interface ReleaseLeaseParams {
  runId: string;
  leaseOwner: string;
}

export interface CausalStorageAdapter {
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;

  createOrGetRun(params: CreateRunParams): Promise<{ run: CausalRunRecord; created: boolean }>;

  getRun(runId: string): Promise<CausalRunRecord | null>;

  getLatestRunByCorrelationKey(
    workflowName: string,
    correlationKey: string,
  ): Promise<CausalRunRecord | null>;

  /** Must return events strictly ordered ascending by `seq` (1..N) */
  getEvents(runId: string): Promise<CausalEventRecord[]>;

  /** Must enforce `expectedSeq` atomically and assign `seq = expectedSeq + 1` */
  appendEvent(params: AppendEventParams): Promise<CausalEventRecord>;

  updateRunStatus(params: UpdateRunStatusParams): Promise<CausalRunRecord>;

  /**
   * Attempts to acquire an exclusive execution lease on a run, so two
   * replicas/pods can't process the same run concurrently (e.g. both
   * reacting to the same signal at once). Must atomically succeed only if no
   * other owner currently holds an unexpired lease on this run. Optional —
   * adapters that omit it are only safe for single-process use; the engine
   * treats its absence as "proceed without distributed locking".
   */
  acquireLease?(params: AcquireLeaseParams): Promise<boolean>;

  /** Releases a previously acquired lease; a no-op if not currently held by `leaseOwner`. */
  releaseLease?(params: ReleaseLeaseParams): Promise<void>;

  /**
   * Returns every run currently `WAITING_ATTESTATION` whose
   * `attestationExpiresAt` deadline is at or before `now` — used to
   * auto-escalate/expire overdue approvals. Optional; adapters that omit it
   * simply don't support deadline enforcement.
   */
  findExpiredWaitingRuns?(now: Date): Promise<CausalRunRecord[]>;

  /**
   * Permanently deletes every run (and its events) in a terminal state
   * (`COMPLETED`, `FAILED`, or `CANCELLED`) last updated at or before
   * `olderThan`, for retention/TTL enforcement. Returns the number of runs
   * deleted. Optional; adapters that omit it simply don't support retention
   * purging.
   */
  purgeCompletedRunsOlderThan?(olderThan: Date): Promise<number>;
}
