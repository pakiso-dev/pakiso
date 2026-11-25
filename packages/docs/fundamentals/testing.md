# Testing

#### Testing workflow handlers

Because a workflow handler is just `(input, ctx) => Promise<output>`, you
can unit test it directly against an `InProcessPakisoEngine` backed by
`InMemoryStorageAdapter` — no mocking required:

```ts
import { InProcessPakisoEngine, InMemoryStorageAdapter } from '@pakiso/core';

test('checkout charges the card and returns the charge id', async () => {
  const engine = new InProcessPakisoEngine({ storage: new InMemoryStorageAdapter() });
  engine.registerWorkflow('checkout', checkoutHandler);

  const run = await engine.startWorkflow({
    workflowName: 'checkout',
    input: { orderId: 'ORD-1' },
  });

  expect(run.status).toBe('COMPLETED');
  expect(run.output).toEqual({ orderId: 'ORD-1', chargeId: 'ch_ORD-1' });
});
```

For a workflow with a gate, assert the intermediate `WAITING_ATTESTATION`
status, then signal it and assert the final result:

```ts
test('order-approval waits for manager sign-off', async () => {
  const storage = new InMemoryStorageAdapter();
  const engine = new InProcessPakisoEngine({ storage });
  engine.registerWorkflow('order-approval', orderApprovalHandler);

  const started = await engine.startWorkflow({
    workflowName: 'order-approval',
    input: { orderId: 'ORD-2' },
  });
  expect(started.status).toBe('WAITING_ATTESTATION');

  await engine.signalByRunId(started.id, {
    gateName: 'manager-approval',
    payload: { approved: true },
  });

  const run = await storage.getRun(started.id);
  expect(run?.status).toBe('COMPLETED');
});
```

#### Testing a custom storage adapter

Use the reusable conformance suite instead of writing the adapter contract's
tests by hand — see
[Implementing a custom storage adapter](/fundamentals/custom-storage-adapters#verifying-your-adapter-the-conformance-suite):

```ts
import { runStorageConformanceTests } from '@pakiso/core/testing';

runStorageConformanceTests({
  createAdapter: () => new MyStorageAdapter(),
});
```

This subpath requires Vitest as a peer dependency.

#### Testing NestJS workflows

`@pakiso/nest`'s own test suite builds a full Nest `TestingModule` with
`PakisoModule.forRoot({ storage: new InMemoryStorageAdapter() })` and a
provider using `@Workflow()`, then asserts on the injected `PAKISO_ENGINE`
token after the module initializes — follow the same pattern for your own
workflow services:

```ts
import { Test } from '@nestjs/testing';
import { PAKISO_ENGINE, PakisoModule } from '@pakiso/nest';
import { InMemoryStorageAdapter } from '@pakiso/core';

const moduleRef = await Test.createTestingModule({
  imports: [PakisoModule.forRoot({ storage: new InMemoryStorageAdapter() })],
  providers: [MyWorkflowService],
}).compile();

const app = moduleRef.createNestApplication();
await app.init();

const engine = app.get(PAKISO_ENGINE);
const run = await engine.startWorkflow({ workflowName: 'my-workflow', input: {} });
```
