# Storage adapters

Pakiso's core runtime owns execution semantics (what a step is, how a gate
suspends, how replay matches the journal) while delegating all persistence
to a `PakisoStorageAdapter`. This BYOS (bring-your-own-storage) contract is
deliberately small so any database — Prisma, Drizzle, TypeORM, DynamoDB,
Redis, ... — can back a run.

#### What Pakiso does (and doesn't) store

A `PakisoStorageAdapter`'s tables (`PakisoRun`/`PakisoEvent`, or whatever
your adapter calls them) are generic and workflow-agnostic:
`input`/`output`/`payload` are opaque JSON blobs, not typed columns per
business entity. **This is not your application's data store.** Pakiso
persists only what the engine itself needs to resume and replay a run
deterministically — it is not where you model or query your business
entities (users, orders, accounts, ...). Those continue to live in your own
database tables, typically written as a side effect inside a step. The
[onboarding recipe](/recipes/onboarding-walkthrough)'s `createAccount` step
makes this explicit: it's a stand-in for "persisting a new user record in
your own domain database," not something Pakiso does for you.

That said, the journal does carry real business data: whatever you pass as
workflow `input`/`output`, or return from a step, is stored verbatim in
these JSON columns — an applicant's email and date of birth, a computed
risk score, a reviewer's notes, and so on. That's exactly why
[encryption](/fundamentals/encryption) and [redaction](/fundamentals/redaction)
are first-class concerns here, rather than an afterthought bolted on later.

#### The contract

```ts
interface PakisoStorageAdapter {
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;

  createOrGetRun(params: CreateRunParams): Promise<{ run: PakisoRunRecord; created: boolean }>;
  getRun(runId: string): Promise<PakisoRunRecord | null>;
  getLatestRunByCorrelationKey(
    workflowName: string,
    correlationKey: string,
  ): Promise<PakisoRunRecord | null>;
  getEvents(runId: string): Promise<PakisoEventRecord[]>;
  appendEvent(params: AppendEventParams): Promise<PakisoEventRecord>;
  updateRunStatus(params: UpdateRunStatusParams): Promise<PakisoRunRecord>;

  // Optional — see "Optional capabilities" below.
  acquireLease?(params: AcquireLeaseParams): Promise<boolean>;
  releaseLease?(params: ReleaseLeaseParams): Promise<void>;
  findExpiredWaitingRuns?(now: Date): Promise<PakisoRunRecord[]>;
  purgeCompletedRunsOlderThan?(olderThan: Date): Promise<number>;
  listRuns?(params: ListRunsParams): Promise<ListRunsResult>;
}
```

| Method | Responsibility |
| --- | --- |
| `connect` / `disconnect` | Optional lifecycle hooks; `@pakiso/nest`'s `PakisoModule` calls these on Nest's module init/destroy. |
| `createOrGetRun` | Create a `PENDING` run, or — if `idempotencyKey` is set and already used for this workflow — return the existing run with `created: false`. |
| `getRun` | Fetch a run by ID, or `null`. |
| `getLatestRunByCorrelationKey` | Fetch the most recent run for a workflow + correlation key, or `null`. |
| `getEvents` | Return a run's journal, **strictly ordered ascending by `seq`, starting at 1.** |
| `appendEvent` | Append an event atomically. **Must** reject unless the current latest `seq` equals `params.expectedSeq`, then assign `seq = expectedSeq + 1` — this is the optimistic-concurrency guard (see `ConcurrencyConflictError`). |
| `updateRunStatus` | Update `status` and optionally `output`/`error`/`attestationExpiresAt`. |

#### Run and event shapes

```ts
type PakisoRunStatus =
  | 'PENDING' | 'RUNNING' | 'WAITING_ATTESTATION'
  | 'COMPLETED' | 'FAILED' | 'CANCELLED';

interface PakisoRunRecord<TInput = Record<string, unknown>, TOutput = Record<string, unknown>> {
  id: string;
  workflowName: string;
  correlationKey: string | null;
  idempotencyKey: string | null;
  status: PakisoRunStatus;
  input: TInput;
  output: TOutput | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Deadline for the gate currently awaited, set via AttestationOptions.expiresAt */
  attestationExpiresAt: Date | null;
}

type PakisoEventType =
  | 'WORKFLOW_STARTED' | 'STEP_COMPLETED'
  | 'ATTESTATION_REQUESTED' | 'ATTESTATION_RECEIVED'
  | 'WORKFLOW_COMPLETED' | 'WORKFLOW_FAILED' | 'WORKFLOW_CANCELLED';

interface PakisoEventRecord<TPayload = Record<string, unknown>> {
  id: string;
  runId: string;
  seq: number;
  type: PakisoEventType;
  stepName: string | null;
  /** Wall-clock ms for STEP_COMPLETED events; null otherwise */
  durationMs: number | null;
  payload: TPayload;
  createdAt: Date;
}
```

#### Relating a run to your business entities

Pakiso doesn't maintain foreign keys into your own schema, but there are
two straightforward ways to associate a run with one of your business
entities — use either, or both, depending on the lookup direction you need.

**1. Run → entity, via `correlationKey`.** Pass a string that encodes your
business identifier when starting the workflow; namespacing it by workflow
name is a good habit to avoid collisions across different workflows:

```ts
const run = await engine.startWorkflow({
  workflowName: 'user-onboarding',
  input: { email, fullName, dateOfBirth },
  correlationKey: `onboarding:${email}`,
});
```

Later, look the run up by that same business key, without needing its
generated ID:

```ts
const run = await storage.getLatestRunByCorrelationKey(
  'user-onboarding',
  `onboarding:${email}`,
);
```

This is the pattern the [onboarding recipe](/recipes/onboarding-walkthrough)
uses for its `GET /onboarding/by-email/:email` endpoint, and the one
`engine.signalByCorrelationKey` uses to resume a run without the caller
knowing its ID (see [Attestation gates](/overview/attestation-gates)).
`getLatestRunByCorrelationKey` returns the single *latest* run for that key,
so it's best suited to "one active run per business key at a time" lookups.

**2. Entity → run, by storing the run ID on your own record.** Inside a
workflow handler, `ctx.runId` is the current run's ID — persist it as a
column on your own table (e.g. `users.onboarding_run_id`) so your
application can join straight from a business entity to its execution
journal:

```ts
@Workflow({ name: 'user-onboarding' })
async onboard(input: OnboardUserInput, ctx: PakisoContext) {
  const account = await ctx.step('create-account', () =>
    this.usersRepository.save({ email: input.email, onboardingRunId: ctx.runId }),
  );
  // ...
}
```

(Inside a `@Recordable()`-decorated method instead, use
`getCurrentPakisoContext()?.runId` from `@pakiso/core` — `@Recordable()`
methods aren't called with `ctx` as a parameter.)

From application code, `storage.getRun(user.onboardingRunId)` and
`storage.getEvents(user.onboardingRunId)` then give you that entity's
current workflow status and full journal on demand. This direction scales
better than `correlationKey` once an entity can go through more than one run
over its lifetime (e.g. a user who re-attempts onboarding) and you need to
track exactly which run applies.

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
- **`listRuns`** — browses/paginates runs filtered by `workflowName`/
  `status`, most-recently-created first, without needing to already know a
  run's id or correlation key. Needed for the [dashboard](/nestjs/dashboard)'s
  run-browsing list; adapters that omit it simply don't support browsing
  (single-run lookups by id still work regardless).

#### The bundled in-memory adapter

```ts
import { InMemoryStorageAdapter } from '@pakiso/core';

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
