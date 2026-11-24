# Storage adapters

Causal's core runtime owns execution semantics (what a step is, how a gate
suspends, how replay matches the journal) while delegating all persistence
to a `CausalStorageAdapter`. This BYOS (bring-your-own-storage) contract is
deliberately small so any database — Prisma, Drizzle, TypeORM, DynamoDB,
Redis, ... — can back a run.

#### The contract

```ts
interface CausalStorageAdapter {
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;

  createOrGetRun(params: CreateRunParams): Promise<{ run: CausalRunRecord; created: boolean }>;
  getRun(runId: string): Promise<CausalRunRecord | null>;
  getLatestRunByCorrelationKey(
    workflowName: string,
    correlationKey: string,
  ): Promise<CausalRunRecord | null>;
  getEvents(runId: string): Promise<CausalEventRecord[]>;
  appendEvent(params: AppendEventParams): Promise<CausalEventRecord>;
  updateRunStatus(params: UpdateRunStatusParams): Promise<CausalRunRecord>;

  // Optional — see "Optional capabilities" below.
  acquireLease?(params: AcquireLeaseParams): Promise<boolean>;
  releaseLease?(params: ReleaseLeaseParams): Promise<void>;
  findExpiredWaitingRuns?(now: Date): Promise<CausalRunRecord[]>;
  purgeCompletedRunsOlderThan?(olderThan: Date): Promise<number>;
}
```

| Method | Responsibility |
| --- | --- |
| `connect` / `disconnect` | Optional lifecycle hooks; `@causal/nest`'s `CausalModule` calls these on Nest's module init/destroy. |
| `createOrGetRun` | Create a `PENDING` run, or — if `idempotencyKey` is set and already used for this workflow — return the existing run with `created: false`. |
| `getRun` | Fetch a run by ID, or `null`. |
| `getLatestRunByCorrelationKey` | Fetch the most recent run for a workflow + correlation key, or `null`. |
| `getEvents` | Return a run's journal, **strictly ordered ascending by `seq`, starting at 1.** |
| `appendEvent` | Append an event atomically. **Must** reject unless the current latest `seq` equals `params.expectedSeq`, then assign `seq = expectedSeq + 1` — this is the optimistic-concurrency guard (see `ConcurrencyConflictError`). |
| `updateRunStatus` | Update `status` and optionally `output`/`error`/`attestationExpiresAt`. |

#### Run and event shapes

```ts
type CausalRunStatus =
  | 'PENDING' | 'RUNNING' | 'WAITING_ATTESTATION'
  | 'COMPLETED' | 'FAILED' | 'CANCELLED';

interface CausalRunRecord<TInput = Record<string, unknown>, TOutput = Record<string, unknown>> {
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
  /** Deadline for the gate currently awaited, set via AttestationOptions.expiresAt */
  attestationExpiresAt: Date | null;
}

type CausalEventType =
  | 'WORKFLOW_STARTED' | 'STEP_COMPLETED'
  | 'ATTESTATION_REQUESTED' | 'ATTESTATION_RECEIVED'
  | 'WORKFLOW_COMPLETED' | 'WORKFLOW_FAILED' | 'WORKFLOW_CANCELLED';

interface CausalEventRecord<TPayload = Record<string, unknown>> {
  id: string;
  runId: string;
  seq: number;
  type: CausalEventType;
  stepName: string | null;
  /** Wall-clock ms for STEP_COMPLETED events; null otherwise */
  durationMs: number | null;
  payload: TPayload;
  createdAt: Date;
}
```

#### Optional capabilities

- **`acquireLease` / `releaseLease`** — exclusive per-run execution locking,
  so two replicas can't process the same run concurrently (e.g. both
  reacting to the same signal at once). If a storage adapter omits these,
  the engine proceeds without distributed locking — only safe for
  single-process use.
- **`findExpiredWaitingRuns`** — returns every run `WAITING_ATTESTATION`
  whose `attestationExpiresAt` is at or before `now`, used by
  `engine.expireOverdueAttestations()` to auto-fail overdue gates.
- **`purgeCompletedRunsOlderThan`** — deletes terminal runs (and their
  events) older than a cutoff, for retention/TTL enforcement.

#### The bundled in-memory adapter

```ts
import { InMemoryStorageAdapter } from '@causal/core';

const storage = new InMemoryStorageAdapter();
```

A zero-dependency, Map-backed adapter intended for **unit tests, examples,
and local development** — its state is lost on process exit. It implements
every optional method, including leases (reject another owner while
unexpired, allow the same owner to renew, allow acquisition after
expiration).

For a persistent adapter, see [the Prisma adapter](/storage/prisma-adapter),
or write your own — see
[Implementing a custom storage adapter](/fundamentals/custom-storage-adapters).
