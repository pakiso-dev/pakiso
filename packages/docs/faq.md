# Frequently asked questions

#### Is `@causal/core` really zero-dependency?

Almost — its `package.json` lists `@opentelemetry/api` as a runtime
dependency, used for workflow/step tracing spans. There are no database
drivers or framework dependencies; persistence is entirely delegated to
whatever `CausalStorageAdapter` you provide.

#### Does Causal make arbitrary code deterministic?

No. `ctx.step()` and `ctx.awaitAttestation()` make the *values* they return
deterministic across resume/replay by journaling them — code outside of
`step()`/`awaitAttestation()` is not made deterministic automatically. Use
`ctx.now()` and `ctx.uuid()` instead of `new Date()`/`crypto.randomUUID()`
directly when a value must stay identical across replay (see
[Causal context](/overview/causal-context)).

#### What happens if my workflow code changes while runs are in flight?

If a resumed or replayed run executes a different step/gate name than
what's already journaled at that sequence position, the engine throws
`CausalDivergenceError`. Avoid removing or reordering steps/gates ahead of
code that existing in-flight runs still depend on; adding new steps
**after** the last journaled position for a given run is safe.

#### Can two processes run the same workflow run concurrently?

Only if your storage adapter implements `acquireLease`/`releaseLease` — the
engine then takes an exclusive per-run lease before executing. Adapters
that omit these methods (like a minimal custom adapter) are only safe for
single-process use. `InMemoryStorageAdapter` and the Prisma adapter both
implement leasing.

#### How do I rotate encryption keys?

Add the old key to `Aes256GcmPayloadCodec`'s `previousKeys` while
`activeKey` becomes the new key — new payloads get the new `kid` stamped on
them, while payloads still encrypted under the previous key continue
decoding correctly. See [Encryption](/fundamentals/encryption).

#### Does `@causal/nest` give me REST endpoints for free?

No — it discovers `@Workflow()` methods and provides `CAUSAL_ENGINE`/
`CAUSAL_STORAGE_ADAPTER` for DI, plus small helpers (idempotency header
reading, response redaction). You build the controllers. See
[REST control plane](/nestjs/rest-control-plane) and the
[onboarding recipe](/recipes/onboarding-walkthrough) for the pattern.

#### Where do I report bugs or ask questions?

Open an issue on [GitHub](https://github.com/causal-dev/causal).
