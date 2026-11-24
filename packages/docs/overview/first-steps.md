# First steps

This walks through the smallest possible Causal program using
`@causal/core` directly, with no framework. If you're using NestJS, read
this first for the underlying concepts, then see [CausalModule](/nestjs/module).

#### Install

```bash
pnpm add @causal/core
```

#### Register a workflow and run it

A workflow is just an `async` function: `(input, ctx) => Promise<output>`.
You register it under a name with a `CausalEngine`, backed by a
`CausalStorageAdapter`:

```ts
import { InProcessCausalEngine, InMemoryStorageAdapter } from '@causal/core';

const engine = new InProcessCausalEngine({
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
boundary: on the first execution it calls `fn()` and journals the result; on
every later resume or replay it returns the already-journaled result without
calling `fn()` again.

#### Suspending for a human/policy decision

Call `ctx.awaitAttestation(gateName)` to durably suspend a run until a
matching signal arrives — this is a **gate**:

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

See [Attestation gates](/overview/attestation-gates) for the full mechanism,
including deadlines and correlation-key based signaling.

#### Next steps

- [Causal engine](/overview/causal-engine) — every `CausalEngine` method in detail.
- [Causal context](/overview/causal-context) — everything `ctx` exposes inside a handler.
- [Storage adapters](/overview/storage-adapters) — the BYOS contract and the bundled in-memory adapter.
- [Replay](/fundamentals/replay) — reproducing a recorded run locally.
