/**
 * Core domain errors. These are the only exceptions the engine throws for
 * control flow or integrity violations — adapters and callers should treat
 * them as structured signals, not generic failures.
 */

/** Thrown by storage adapters when expectedSeq does not match latest stream seq */
export class ConcurrencyConflictError extends Error {
  constructor(
    public readonly runId: string,
    public readonly expectedSeq: number,
  ) {
    super(`Concurrency conflict on run "${runId}": expected seq ${expectedSeq}`);
    this.name = 'ConcurrencyConflictError';
  }
}

/** Thrown during replay if code executes a different step/gate than recorded in journal */
export class CausalDivergenceError extends Error {
  constructor(
    public readonly runId: string,
    public readonly seq: number,
    public readonly expectedStep: string,
    public readonly actualStep: string,
  ) {
    super(
      `Causal divergence on run "${runId}" at seq ${seq}: expected "${expectedStep}", got "${actualStep}"`,
    );
    this.name = 'CausalDivergenceError';
  }
}

/** Internal control-flow signal caught by CausalEngine to park run in WAITING_ATTESTATION */
export class WorkflowSuspendedError extends Error {
  constructor(
    public readonly runId: string,
    public readonly gateName: string,
  ) {
    super(`Run "${runId}" suspended awaiting attestation "${gateName}"`);
    this.name = 'WorkflowSuspendedError';
  }
}

/**
 * Thrown when the engine cannot acquire a run's execution lease because
 * another worker/replica currently holds it — prevents two pods from
 * processing the same run concurrently (e.g. both reacting to the same
 * signal at once).
 */
export class LeaseConflictError extends Error {
  constructor(
    public readonly runId: string,
    public readonly leaseOwner: string,
  ) {
    super(`Could not acquire execution lease for run "${runId}": held by another worker`);
    this.name = 'LeaseConflictError';
  }
}
