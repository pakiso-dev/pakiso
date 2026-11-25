# Discovery service

`WorkflowExplorer` is the provider that turns `@Workflow()`-decorated
methods scattered across your Nest providers into registered handlers on
the `PakisoEngine` — you don't normally interact with it directly, but it's
worth understanding what it does at bootstrap.

#### What it does

`WorkflowExplorer` implements `OnModuleInit`. On initialization it:

1. Gets every provider Nest's `DiscoveryService` knows about.
2. Skips providers without an instantiated object/prototype.
3. Scans each provider's prototype method names with `MetadataScanner`.
4. Reads the `PAKISO_WORKFLOW_METADATA` metadata key off each method —
   this is what `@Workflow()` attaches via Nest's `SetMetadata`.
5. For every method that has it, wraps it as a handler bound to the
   provider instance, and calls:

   ```ts
   engine.registerWorkflow(options.name, handler);
   ```

```ts
const handler: WorkflowHandler = (input, ctx) => method.call(instance, input, ctx);
```

This is why `@Workflow()` methods can be ordinary instance methods with
injected dependencies (like `PaymentsService` above) — the explorer calls
them bound to their real provider instance, with Nest DI fully resolved.

#### What it doesn't do

`WorkflowExplorer` registers workflows with the engine; it does **not**
expose a method to list registered workflow names, nor any REST
endpoint. If your application needs a "list all workflows" admin/control
endpoint, build it on top of whatever registry you maintain yourself (e.g.
by tracking the names you pass to `@Workflow({ name: ... })`) — see
[REST control plane](/nestjs/rest-control-plane).

#### Constants

```ts
PAKISO_WORKFLOW_METADATA // 'pakiso:workflow' — the SetMetadata key used by @Workflow()
PAKISO_ENGINE            // DI token for the InProcessPakisoEngine
```

Both are exported from `@pakiso/nest` if you need to read workflow metadata
yourself (e.g. to build a custom explorer or admin tool).
