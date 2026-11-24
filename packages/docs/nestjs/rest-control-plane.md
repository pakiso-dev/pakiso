# REST control plane

`@causal/nest` does **not** ship controllers or routes — starting runs,
signaling gates, and inspecting run status over HTTP is left to your
application, built on top of the injected `CAUSAL_ENGINE` and
`CAUSAL_STORAGE_ADAPTER` tokens. This page shows the pattern used by the
bundled [example app](/recipes/onboarding-walkthrough); adapt it to your own
routes/DTOs.

#### Starting a run idempotently

Combine `readIdempotencyKey` (see [Idempotency](/fundamentals/idempotency))
with a `correlationKey` derived from a business identifier, so the run can
later be looked up or signaled without needing its generated ID:

```ts
import { CAUSAL_ENGINE, readIdempotencyKey } from '@causal/nest';
import type { CausalEngine } from '@causal/core';

@Controller('onboarding')
export class OnboardingController {
  constructor(@Inject(CAUSAL_ENGINE) private readonly engine: CausalEngine) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED) // the workflow typically suspends almost immediately
  async start(
    @Body() dto: CreateOnboardingDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const correlationKey = `onboarding:${dto.email}`;
    const idempotencyKey = readIdempotencyKey(headers);

    const run = await this.engine.startWorkflow({
      workflowName: 'user-onboarding',
      input: dto,
      correlationKey,
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
    });

    return { runId: run.id, status: run.status, correlationKey };
  }
}
```

Returning `202 Accepted` communicates that the run is in progress /
suspended rather than synchronously finished — appropriate for any workflow
that awaits a gate almost immediately.

#### Signaling a gate by run ID

```ts
@Post(':runId/email-verified')
async verifyEmail(@Param('runId') runId: string) {
  await this.engine.signalByRunId(runId, {
    gateName: 'email-verified',
    payload: { verifiedAt: new Date().toISOString() },
  });
  return this.getRun(runId);
}
```

#### Looking a run up by a business key, without the run ID

```ts
@Get('by-email/:email')
async getRunByEmail(@Param('email') email: string) {
  const run = await this.storage.getLatestRunByCorrelationKey(
    'user-onboarding',
    `onboarding:${email}`,
  );
  if (!run) {
    throw new NotFoundException(`No run found for email "${email}"`);
  }
  return run;
}
```

::: tip Route ordering
Register a literal-prefixed route like `GET by-email/:email` **before** a
generic `GET :runId` route, so the framework doesn't try to treat the
literal `by-email` segment as a `:runId`.
:::

#### Inspecting a run's status and journal

```ts
@Get(':runId')
async getRun(@Param('runId') runId: string) {
  const run = await this.storage.getRun(runId);
  if (!run) {
    throw new NotFoundException(`No run found with id "${runId}"`);
  }
  const events = await this.storage.getEvents(runId);
  return { run, events };
}
```

::: tip Looking for a ready-made browsing UI?
If you want to browse *every* run (not just one you already have the id or
correlation key for) — e.g. "show me every run waiting on approval" — see
the [dashboard](/nestjs/dashboard) package instead of hand-rolling a listing
endpoint: `@causal/dashboard` mounts a read-only UI + JSON API for exactly
this, reusing the same `CAUSAL_STORAGE_ADAPTER` provider.
:::

#### Redacting sensitive fields automatically

Apply `RedactResponseInterceptor` at the controller level so every response
— including the raw `run`/`events` above — has sensitive fields masked (see
[Redaction](/fundamentals/redaction)):

```ts
@UseInterceptors(RedactResponseInterceptor)
@Controller('onboarding')
export class OnboardingController { /* ... */ }
```

For the complete, runnable version of this controller — including
compliance-approval gating and OpenAPI/Swagger annotations — see the
[onboarding recipe](/recipes/onboarding-walkthrough).
