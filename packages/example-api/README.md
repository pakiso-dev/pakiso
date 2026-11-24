# `@causal/example-api`

A runnable NestJS API demonstrating `@causal/nest` end to end with a durable
**user-onboarding** workflow: create an account, wait for the user to verify
their email, run an (automated) compliance/KYC check, and — only when that
check flags the applicant as high-risk — suspend for a human compliance
officer's sign-off before activating the account.

It exists purely as a reference: a small, realistic use case showing how the
pieces documented in [docs/causal_implementation_plan.md](../../docs/causal_implementation_plan.md)
fit together in a real app, not a package you depend on.

## What it demonstrates

* **`CausalModule.forRootAsync()`** wired up with a storage adapter resolved
  at startup (see `src/storage.ts`): the zero-config `InMemoryStorageAdapter`
  by default, or `@causal/storage-prisma`/SQLite when `CAUSAL_DATABASE_URL`
  is set — handy for inspecting runs afterwards with Prisma Studio (below).
* **`@Workflow()`** on `OnboardingService#onboard` — the single source of
  truth for the onboarding process, discovered automatically at bootstrap.
* **`@Recordable()`** for simple side effects (`createAccount`,
  `sendVerificationEmail`, `activateAccount`) vs. an explicit **`ctx.step()`**
  call for `runComplianceCheck`, where the step name needs to differ from the
  method name.
* **`ctx.awaitAttestation()`** used twice: an unconditional `email-verified`
  gate, and a conditional `compliance-approval` gate only reached for
  high-risk applicants — showing that branching on a step's *recorded*
  result (never on live randomness) keeps replay/resume deterministic.
* **REST control plane**: starting a run idempotently (`Idempotency-Key`
  header + `correlationKey`), signaling suspended gates by `runId`, and
  `RedactResponseInterceptor` masking sensitive fields (`dateOfBirth`) on the
  way out.
* **Swagger UI** (`@nestjs/swagger`) at `/docs` for interactively driving
  every route. Since this app's build tooling (tsup/esbuild, Vitest's
  default esbuild transform) doesn't emit TypeScript's `design:type`
  decorator metadata, every `@ApiProperty()` sets `type` explicitly rather
  than relying on inferred metadata — the same workaround `dto-validation.pipe.ts`
  uses for request validation.

## Running it

```bash
pnpm --filter @causal/example-api dev
# or, from this directory:
pnpm dev
```

The server listens on `http://localhost:3000` (override with `PORT`). Open
`http://localhost:3000/docs` for an interactive Swagger UI covering every
route — start a run, verify its email, approve/reject compliance, and
inspect the run's journal, all without leaving the browser.

## Walking through the workflow via curl

```bash
# 1. Start an onboarding run. The workflow suspends almost immediately
#    waiting for email verification, so this returns 202 Accepted.
curl -s -X POST http://localhost:3000/onboarding \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","fullName":"Ada Lovelace","dateOfBirth":"1990-01-01"}'
# => { "runId": "...", "status": "WAITING_ATTESTATION", "correlationKey": "onboarding:ada@example.com" }

RUN_ID=<runId from above>

# 2. Inspect the run's status and full execution journal.
curl -s http://localhost:3000/onboarding/$RUN_ID | jq

# 3. Simulate the user clicking the email verification link.
curl -s -X POST http://localhost:3000/onboarding/$RUN_ID/email-verified

# At this point the run either completes immediately (low-risk applicants)
# or suspends again awaiting `compliance-approval` (high-risk applicants,
# deterministically hashed from the email for this example).

# 4. If it's awaiting compliance approval, sign off on it:
curl -s -X POST http://localhost:3000/onboarding/$RUN_ID/compliance-approval \
  -H 'Content-Type: application/json' \
  -d '{"approved":true,"reviewer":"compliance-bot"}'

# 5. Look up the latest run for an email address without needing the runId.
curl -s http://localhost:3000/onboarding/by-email/ada@example.com | jq
```

## Persisting runs & viewing them in Prisma Studio

By default this app uses the zero-config `InMemoryStorageAdapter` — runs
disappear on restart, and there's nothing for Prisma Studio to show. Set
`CAUSAL_DATABASE_URL` to a SQLite file to persist runs via
`@causal/storage-prisma` instead (see `src/storage.ts`):

```bash
# One-time: generate the Prisma client for this package's schema.
pnpm --filter @causal/example-api generate:sqlite

# Use an *absolute* file: URL — SQLite resolves relative paths relative to
# the schema file's own directory, not your shell's cwd, which is a common
# footgun here.
export CAUSAL_DATABASE_URL="file:$(pwd)/packages/example-api/dev.db"

# Create the database/tables (first run only; safe to re-run).
pnpm --filter @causal/example-api exec prisma db push --schema=prisma/schema.prisma

# Run the app against that database.
pnpm --filter @causal/example-api dev
```

Drive a run or two through the `curl` flow above, then — with the same
`CAUSAL_DATABASE_URL` exported — open Prisma Studio in another terminal:

```bash
pnpm --filter @causal/example-api exec prisma studio --schema=prisma/schema.prisma
```

This opens `http://localhost:5555` with a browsable UI over the
`causal_runs` and `causal_events` tables, showing exactly the same execution
journal as `GET /onboarding/:runId` — unredacted, since Studio reads the raw
database rows directly.

## Tests

```bash
pnpm --filter @causal/example-api test
```

The test suite drives the full HTTP lifecycle (including both the low-risk
"straight through" path and the high-risk compliance-gate path) against an
in-memory `CausalStorageAdapter`, so it needs no external services.
