# Causal engine

`@causal/core` ships one `CausalEngine` implementation,
`InProcessCausalEngine`, which executes workflow handlers in-process against
a `CausalStorageAdapter`. There's no separately-named `CausalEngine` class —
`CausalEngine` is the interface, `InProcessCausalEngine` is what you
construct.

#### Construction

```ts
import { InProcessCausalEngine } from '@causal/core';

interface InProcessCausalEngineOptions {
  storage: CausalStorageAdapter;
  /** Identifies this engine instance when acquiring execution leases. Defaults to a random UUID. */
  leaseOwner?: string;
  /** How long an acquired lease is held before another worker may steal it. Defaults to 30s. */
  leaseDurationMs?: number;
}

const engine = new InProcessCausalEngine({ storage });
```

`leaseOwner` and `leaseDurationMs` only matter if your storage adapter
implements the optional `acquireLease`/`releaseLease` methods (see
[Storage adapters](/overview/storage-adapters)) — they let two
replicas/pods avoid processing the same run concurrently.

#### `registerWorkflow(name, handler)`

```ts
registerWorkflow(name: string, handler: WorkflowHandler): void;
```

Registers (or replaces) the handler for a workflow name. A handler has the
shape `(input, ctx) => Promise<output>`.

#### `startWorkflow(params)`

```ts
startWorkflow<TInput extends Record<string, unknown>>(
  params: StartWorkflowParams<TInput>,
): Promise<CausalRunRecord>;

interface StartWorkflowParams<TInput> {
  workflowName: string;
  input: TInput;
  correlationKey?: string;
  idempotencyKey?: string;
}
```

Creates a new run (or returns an existing one) and executes the handler
immediately. If `idempotencyKey` is supplied and a run already exists for
that `(workflowName, idempotencyKey)` pair, the **existing** run is returned
without re-executing the handler — see [Idempotency](/fundamentals/idempotency).
`correlationKey` lets you later look a run up without its ID (e.g. by email
address) via `signalByCorrelationKey` or `storage.getLatestRunByCorrelationKey`.

The returned `CausalRunRecord.status` reflects what happened: `'COMPLETED'`
if the handler ran to completion, `'WAITING_ATTESTATION'` if it suspended at
a gate, or `'FAILED'` if it threw.

#### `signalByRunId(runId, signal)`

```ts
signalByRunId<TPayload extends Record<string, unknown>>(
  runId: string,
  signal: SignalWorkflowParams<TPayload>,
): Promise<void>;

interface SignalWorkflowParams<TPayload> {
  gateName: string;
  payload: TPayload;
}
```

Resumes a run that is currently `WAITING_ATTESTATION` at the named gate. The
handler re-executes from the top; already-recorded steps and gates return
their journaled results without re-running, and `awaitAttestation(gateName)`
returns `payload` for the matching gate.

#### `signalByCorrelationKey(workflowName, correlationKey, signal)`

```ts
signalByCorrelationKey<TPayload extends Record<string, unknown>>(
  workflowName: string,
  correlationKey: string,
  signal: SignalWorkflowParams<TPayload>,
): Promise<void>;
```

Same as `signalByRunId`, but looks up the latest run for a workflow +
correlation key instead of requiring the run ID — useful when the caller
only knows a business identifier (e.g. an email address or order ID).

#### `replayRun(runId, stubs?)`

```ts
replayRun(runId: string, stubs?: Record<string, unknown>): Promise<CausalRunRecord>;
```

Reruns the registered handler against the run's recorded events **without
persisting changes or executing recorded step callbacks**. `stubs` lets you
override specific steps' results by step name, to reproduce a bug
deterministically. A run still suspended at a gate replays with status
`'WAITING_ATTESTATION'`. See [Replay](/fundamentals/replay) for the full
workflow, including the `causal replay` CLI command.

#### Determinism and divergence

If, on resume or replay, the handler executes a different step/gate name
than what's journaled at that position, the engine throws
`CausalDivergenceError(runId, seq, expectedStep, actualStep)` — this usually
means the handler's code changed in a way that's incompatible with runs
already in flight.

#### Errors

| Error | Thrown when |
| --- | --- |
| `ConcurrencyConflictError(runId, expectedSeq)` | A storage adapter's `appendEvent` rejects because `expectedSeq` doesn't match the latest journal sequence. |
| `CausalDivergenceError(runId, seq, expectedStep, actualStep)` | Resume/replay executes a different step/gate than what's journaled. |
| `WorkflowSuspendedError(runId, gateName, expiresAt?)` | Internal control-flow signal thrown by `ctx.awaitAttestation()` and caught by the engine — you shouldn't need to catch this yourself. |
| `LeaseConflictError(runId, leaseOwner)` | The engine couldn't acquire a run's execution lease because another worker holds it. |

All four are exported from `@causal/core`.
