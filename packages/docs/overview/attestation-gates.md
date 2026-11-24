# Attestation gates

An **attestation gate** is Causal's mechanism for durably suspending a run
until a human or a policy engine makes a decision — "wait for the user to
click the email verification link," "wait for a compliance officer to
approve this application." It is the core primitive behind Causal's
human/policy sign-off story.

#### How a gate works

```ts
const approval = await ctx.awaitAttestation<{ approved: boolean }>('manager-approval');
```

1. The first time the handler reaches this line, Causal records an
   `ATTESTATION_REQUESTED` event under the gate name and throws an internal
   `WorkflowSuspendedError` — this is caught by the engine, not by your code.
2. The engine catches it, updates the run's status to `WAITING_ATTESTATION`,
   and returns the (now-waiting) run from `startWorkflow`/`signalByRunId`.
   The process can now exit, scale down, or crash — the run's state is
   fully durable.
3. Later, something calls `engine.signalByRunId(runId, { gateName, payload })`
   (typically an HTTP endpoint hit by the human or policy system).
4. The engine records an `ATTESTATION_RECEIVED` event, then **re-executes
   the handler from the top**. Already-recorded steps and gates return their
   journaled results instantly (they do not re-run); the matching
   `awaitAttestation(gateName)` call returns `payload` this time.

```ts
await engine.signalByRunId(started.id, {
  gateName: 'manager-approval',
  payload: { approved: true },
});
```

The `gateName` passed to `signalByRunId`/`signalByCorrelationKey` **must
match** the gate the run is currently waiting on, or signaling fails.

#### Multiple gates in sequence

A workflow can await more than one gate, and can make gates conditional on
earlier results — see the [onboarding recipe](/recipes/onboarding-walkthrough)
for a full example where a second `compliance-approval` gate is only
awaited when an earlier step flags the run as high-risk:

```ts
await ctx.awaitAttestation('email-verified');

const { riskScore } = await ctx.step('run-compliance-check', runComplianceCheck);

if (riskScore >= HIGH_RISK_SCORE_THRESHOLD) {
  const approval = await ctx.awaitAttestation<{ approved: boolean }>('compliance-approval');
  if (!approval.approved) {
    throw new Error('Onboarding rejected');
  }
}
```

#### Signaling by correlation key

If the caller doesn't have the run ID handy — e.g. a webhook that only
knows an email address — use `signalByCorrelationKey` instead, matching the
`correlationKey` passed to `startWorkflow`:

```ts
await engine.signalByCorrelationKey('user-onboarding', 'onboarding:ada@example.com', {
  gateName: 'email-verified',
  payload: { verifiedAt: new Date().toISOString() },
});
```

#### Deadlines

```ts
await ctx.awaitAttestation('manager-approval', {
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  metadata: { requestedBy: 'order-service' },
});
```

`expiresAt` is recorded on the run as `attestationExpiresAt`. If your
storage adapter implements `findExpiredWaitingRuns`, call
`engine.expireOverdueAttestations(now?)` (e.g. on a cron/scheduler) to
auto-fail every run whose gate deadline has passed:

```ts
const expired = await engine.expireOverdueAttestations();
```

This acquires a lease for each expired run (skipping ones another worker
already holds a lease on), records a failure event, and marks the run
`FAILED`. `metadata` is recorded alongside the `ATTESTATION_REQUESTED` event
for audit purposes but is not otherwise interpreted by the engine.

::: tip
Causal provides the suspend/resume mechanism — not a human-approval UI or an
authorization layer. Who is allowed to call `signalByRunId` for a given gate
is your application's concern (see the
[REST control plane](/nestjs/rest-control-plane) page for one way to expose
this over HTTP).
:::
