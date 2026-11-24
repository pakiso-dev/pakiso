# What is Causal?

Causal is a stateful, deterministic, auditable execution framework for
Node.js and NestJS. It is built around one idea: a workflow is a normal
`async` function, but every side effect and every suspension point it makes
is durably recorded, so the function can be **resumed** after a crash or
**replayed** later without re-running work that already happened.

#### What it gives you

- **Durable execution** — a workflow handler can `await` a step, crash the
  process, and resume later picking up exactly where it left off. Completed
  steps are never re-executed.
- **Human/policy attestation gates** — `ctx.awaitAttestation(gateName)`
  suspends a run until an external signal (an API call, typically) arrives.
  This is how Causal models "wait for a human to click a link" or "wait for a
  compliance officer to approve."
- **Bring-your-own-storage (BYOS)** — persistence is a small adapter
  interface (`CausalStorageAdapter`). Use the bundled in-memory adapter for
  tests, the Prisma adapter for Postgres/MySQL/SQLite, or implement your own.
- **Local trace replay** — `causal replay <runId>` reruns a recorded run
  against your real workflow handlers on your machine, with optional step
  stubs, so you can reproduce a production bug deterministically.
- **At-rest encryption and redaction** — an AES-256-GCM payload codec for
  encrypting run/event payloads in storage, and a redaction helper for
  masking sensitive fields in HTTP responses.

#### Packages

| Package | Description |
| --- | --- |
| [`@causal/core`](/overview/causal-engine) | Zero-dependency deterministic execution engine (BYOS, replay, encryption) |
| [`@causal/nest`](/nestjs/module) | NestJS module, decorators, discovery, REST control-plane helpers |
| [`@causal/storage-prisma`](/storage/prisma-adapter) | Multi-dialect Prisma storage adapter (Postgres/MySQL/SQLite) |
| [`@causal/cli`](/cli/overview) | Developer CLI (`causal init` / `causal inspect` / `causal replay`) |
| `@causal/example-api` | Example NestJS app: see the [onboarding recipe](/recipes/onboarding-walkthrough) |

#### What Causal does (and doesn't) store

Causal's storage adapter is not your application's business data store. It
persists only what the engine needs to resume and replay a run
deterministically — run metadata, the workflow's input/output, and an
append-only journal of completed steps and attestation gates, all as opaque
JSON. Your actual business entities (users, orders, accounts, ...) continue
to live in your own database tables, typically written as a side effect
inside a step — see
[what Causal does (and doesn't) store](/overview/storage-adapters#what-causal-does-and-doesn-t-store)
for the full picture, including how to associate a run with one of your own
business entities.

#### Installation

```bash
corepack enable
pnpm add @causal/core
# Using NestJS?
pnpm add @causal/nest
# Need persistent storage?
pnpm add @causal/storage-prisma
# Developer CLI (schema bootstrapping, inspect, replay)
pnpm add -D @causal/cli
```

::: tip Engines
All packages require Node.js >= 18.
:::

Continue to [First steps](/overview/first-steps) to register and run your
first workflow.
