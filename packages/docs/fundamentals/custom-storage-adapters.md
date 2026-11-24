# Implementing a custom storage adapter

If neither the bundled `InMemoryStorageAdapter` nor
[`@causal/storage-prisma`](/storage/prisma-adapter) fits your stack,
implement `CausalStorageAdapter` yourself — see
[Storage adapters](/overview/storage-adapters) for the full contract.

#### Minimum viable adapter

At minimum you must implement `createOrGetRun`, `getRun`,
`getLatestRunByCorrelationKey`, `getEvents`, `appendEvent`, and
`updateRunStatus`. The two hardest invariants to get right:

1. **`getEvents` must return events strictly ordered ascending by `seq`,
   starting at 1.** Replay depends on this ordering to match journaled steps
   and gates by position.
2. **`appendEvent` must atomically enforce `expectedSeq`.** Reject the write
   (by throwing `ConcurrencyConflictError`) unless the current latest `seq`
   for the run equals `params.expectedSeq`, then persist the new event with
   `seq = expectedSeq + 1`. This is what prevents two concurrent executions
   of the same run from corrupting its journal.

```ts
import { ConcurrencyConflictError } from '@causal/core';
import type { AppendEventParams, CausalEventRecord, CausalStorageAdapter } from '@causal/core';

class MyStorageAdapter implements CausalStorageAdapter {
  async appendEvent(params: AppendEventParams): Promise<CausalEventRecord> {
    // Inside a transaction / atomic write:
    const latestSeq = await this.getLatestSeq(params.runId);
    if (latestSeq !== params.expectedSeq) {
      throw new ConcurrencyConflictError(params.runId, params.expectedSeq);
    }
    return this.insertEvent({ ...params, seq: params.expectedSeq + 1 });
  }

  // ...createOrGetRun, getRun, getLatestRunByCorrelationKey, getEvents, updateRunStatus
}
```

#### Optional methods

Implement `acquireLease`/`releaseLease` if you need multi-process/
multi-replica safety; `findExpiredWaitingRuns` if you want
`engine.expireOverdueAttestations()` to work; `purgeCompletedRunsOlderThan`
for retention/TTL policies. Omitting any of these simply disables that
feature — the engine checks for their presence at runtime.

#### Verifying your adapter: the conformance suite

`@causal/core` ships a reusable, Vitest-based conformance suite — modeled on
the Keyv `@keyv/test-suite` pattern — so you can verify your adapter
satisfies the contract without hand-writing every edge case yourself. It's
exported from the `/testing` subpath (not the main entry point), so
`@causal/core` itself stays free of a runtime dependency on a test
framework:

```ts
// my-storage-adapter.conformance.test.ts
import { runStorageConformanceTests } from '@causal/core/testing';
import { MyStorageAdapter } from './my-storage-adapter.js';

runStorageConformanceTests({
  createAdapter: () => new MyStorageAdapter(),
});
```

```ts
interface StorageConformanceOptions {
  /** Factory invoked at the start of each test to produce a fresh adapter instance */
  createAdapter: () => CausalStorageAdapter | Promise<CausalStorageAdapter>;
}
```

The suite covers run creation, idempotency-key deduplication, correlation-key
lookups, event sequencing, `ConcurrencyConflictError` on sequence mismatch,
and status/output updates. `@causal/storage-prisma` runs this exact suite
against a real, file-based SQLite database in its own test suite — see
[the Prisma adapter](/storage/prisma-adapter).

This requires Vitest as a peer dependency — install it if your project
doesn't already have it.
