# Idempotency

Causal handles idempotent workflow starts at the engine level, and
`@causal/nest` adds a small helper for the common HTTP case of reading an
`Idempotency-Key` request header.

#### At the engine level: `idempotencyKey`

```ts
const run = await engine.startWorkflow({
  workflowName: 'checkout',
  input: { orderId: 'ORD-1' },
  idempotencyKey: 'checkout-ORD-1',
});
```

`CausalStorageAdapter.createOrGetRun` deduplicates by the
`(workflowName, idempotencyKey)` pair: if a run already exists for that
pair, it is returned as-is (with `created: false` internally), and its
handler is **not** re-executed. This is what makes it safe to retry a
`startWorkflow` call after a timeout or crash without double-starting the
workflow.

#### Reading the header in a NestJS controller

```ts
import { IDEMPOTENCY_KEY_HEADER, readIdempotencyKey } from '@causal/nest';

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

function readIdempotencyKey(
  headers: Record<string, string | string[] | undefined>,
): string | undefined;
```

`readIdempotencyKey` reads the lowercase `idempotency-key` header (Node,
Express, and Fastify all normalize incoming header names to lowercase), and
returns the **first** value if the header was sent multiple times.

```ts
@Post()
async start(@Headers() headers: Record<string, string | string[] | undefined>) {
  const idempotencyKey = readIdempotencyKey(headers);

  const run = await this.engine.startWorkflow({
    workflowName: 'user-onboarding',
    input: { /* ... */ },
    ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
  });

  return { runId: run.id, status: run.status };
}
```

This helper only **extracts** the header value — it doesn't implement
storage or deduplication itself (that's `createOrGetRun`'s job), and it
isn't a Nest guard or interceptor. See the
[REST control plane](/nestjs/rest-control-plane) page and the
[onboarding recipe](/recipes/onboarding-walkthrough) for the full pattern,
including pairing it with `correlationKey` for lookup-by-business-key.
