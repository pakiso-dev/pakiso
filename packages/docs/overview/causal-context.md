# Causal context

`CausalContext` is the second argument passed to every workflow handler. It
is `AsyncLocalStorage`-backed, which means it's also accessible to nested
async helpers without threading it explicitly through every call (see
[`@Recordable()`](/nestjs/decorators) for how `@causal/nest` uses this).

```ts
interface CausalContext {
  readonly runId: string;
  readonly workflowName: string;
  readonly correlationKey: string | null;
  readonly isReplaying: boolean;

  step<TResult>(
    stepName: string,
    fn: () => Promise<TResult> | TResult,
    options?: StepOptions,
  ): Promise<TResult>;

  awaitAttestation<TPayload = Record<string, unknown>>(
    gateName: string,
    options?: AttestationOptions,
  ): Promise<TPayload>;

  now(): Promise<Date>;
  uuid(): Promise<string>;
}
```

#### Properties

- **`runId`** — the current run's ID.
- **`workflowName`** — the name the workflow was registered/started under.
- **`correlationKey`** — the `correlationKey` passed to `startWorkflow`, or `null`.
- **`isReplaying`** — `true` while executing under `engine.replayRun()`. Use
  this to skip non-idempotent side effects (e.g. logging, metrics emission)
  that shouldn't happen twice.

#### `step(stepName, fn, options?)`

The deterministic, replay-safe side-effect boundary:

```ts
interface StepOptions {
  /** Optional stub value injected during local `causal replay` */
  stubResult?: unknown;
}

const charge = await ctx.step('charge-card', async () => chargeCard(orderId));
```

The first time a run reaches this call, `fn()` executes and its result is
journaled as a `STEP_COMPLETED` event under `stepName` (along with the
wall-clock duration, as `durationMs` — observability data only; duration is
never compared during replay). On every later resume or replay, the engine
matches the journal by sequence and step name and returns the recorded
result **without calling `fn()` again**.

#### `awaitAttestation(gateName, options?)`

```ts
interface AttestationOptions {
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

const approval = await ctx.awaitAttestation<{ approved: boolean }>('manager-approval', {
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
});
```

Durably suspends the run until a matching `engine.signalByRunId`/
`signalByCorrelationKey` call arrives for `gateName`. See
[Attestation gates](/overview/attestation-gates) for the full mechanism.

#### `now()` and `uuid()`

```ts
const timestamp = await ctx.now(); // Date
const id = await ctx.uuid();       // string
```

Both are implemented as named steps internally, so their results are
journaled and replay returns the **original** value rather than a new
timestamp/UUID — use these instead of `new Date()` / `crypto.randomUUID()`
directly whenever the value must stay identical across resume and replay.

#### Accessing the context outside a handler argument

```ts
import { getCurrentCausalContext, runWithCausalContext } from '@causal/core';

function getCurrentContext(): CausalContext | undefined {
  return getCurrentCausalContext();
}
```

`@causal/nest`'s [`@Recordable()`](/nestjs/decorators) decorator uses
exactly this to make an existing service method replay-safe without passing
`ctx` into its call sites.
