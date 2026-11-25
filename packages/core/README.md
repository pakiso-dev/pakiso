# @pakiso/core

Zero-dependency deterministic execution engine for Pakiso — the BYOS
(Bring-Your-Own-Storage) contract, `AsyncLocalStorage`-based context, replay,
and at-rest payload encryption. Framework-agnostic; see
[`@pakiso/nest`](../nest) for the NestJS integration.

## Install

```bash
pnpm add @pakiso/core
```

## Usage

A workflow is just an `async` function: `(input, ctx) => Promise<output>`.
Register it under a name with an `InProcessPakisoEngine`, backed by any
`PakisoStorageAdapter`:

```ts
import { InProcessPakisoEngine, InMemoryStorageAdapter } from '@pakiso/core';

const engine = new InProcessPakisoEngine({
  storage: new InMemoryStorageAdapter(),
});

engine.registerWorkflow('checkout', async (input: { orderId: string }, ctx) => {
  const charge = await ctx.step('charge-card', async () => {
    // Call your payment provider here.
    return { chargeId: `ch_${input.orderId}` };
  });

  return { orderId: input.orderId, chargeId: charge.chargeId };
});

const run = await engine.startWorkflow({
  workflowName: 'checkout',
  input: { orderId: 'ORD-1' },
});

console.log(run.status); // 'COMPLETED'
console.log(run.output); // { orderId: 'ORD-1', chargeId: 'ch_ORD-1' }
```

`ctx.step(stepName, fn)` is the deterministic, replay-safe side-effect
boundary: on first execution it calls `fn()` and journals the result; on every
later resume or replay it returns the already-journaled result without
calling `fn()` again.

### Human/policy attestation gates

Call `ctx.awaitAttestation(gateName)` to durably suspend a run until a
matching signal arrives:

```ts
engine.registerWorkflow('order-approval', async (input: { orderId: string }, ctx) => {
  const decision = await ctx.awaitAttestation<{ approved: boolean }>('manager-approval');
  if (!decision.approved) {
    throw new Error('Order rejected');
  }
  return { orderId: input.orderId, approved: true };
});

const started = await engine.startWorkflow({
  workflowName: 'order-approval',
  input: { orderId: 'ORD-2' },
});

console.log(started.status); // 'WAITING_ATTESTATION'

// ... later, e.g. from an HTTP handler, after a manager approves it:
await engine.signalByRunId(started.id, {
  gateName: 'manager-approval',
  payload: { approved: true },
});
```

## Bring your own storage

`InMemoryStorageAdapter` (exported from this package) is for tests/local
development only. For anything durable, implement `PakisoStorageAdapter`
yourself or use [`@pakiso/storage-prisma`](../storage-prisma) (PostgreSQL,
MySQL, SQLite). Any adapter author can verify conformance against the full
contract via the `./testing` subpath:

```ts
import { runStorageConformanceTests } from '@pakiso/core/testing';

runStorageConformanceTests({
  createAdapter: () => new MyCustomStorageAdapter(),
});
```

## Encryption

`Aes256GcmPayloadCodec` encrypts event payloads at rest with AES-256-GCM.
Wrap any `PakisoStorageAdapter` in a `CodedStorageAdapter` to apply it
transparently:

```ts
import { Aes256GcmPayloadCodec, CodedStorageAdapter, InMemoryStorageAdapter } from '@pakiso/core';

const codec = new Aes256GcmPayloadCodec({
  activeKey: { kid: 'default', key: process.env.PAKISO_ENCRYPTION_KEY! }, // 32 bytes, base64
});
const storage = new CodedStorageAdapter(new InMemoryStorageAdapter(), codec);
```

`previousKeys` lets `decode()` still read payloads written under a retired
key during rotation, while `encode()` always uses `activeKey`. (If you're
using [`@pakiso/nest`](../nest)'s `PakisoModule`, this wiring from
`PAKISO_ENCRYPTION_KEY`/`PAKISO_ENCRYPTION_KEY_ID` env vars happens for you
automatically.) See the
[Encryption](https://pakiso-dev.github.io/pakiso/fundamentals/encryption) docs for details.

## Documentation

Full docs, including the complete `PakisoEngine`/`ctx` API reference, replay,
idempotency, and redaction, live at [pakiso-dev.github.io/pakiso](https://pakiso-dev.github.io/pakiso/).
