# Recipe: durable user-onboarding workflow

`@causal/example-api` is a complete, runnable NestJS app demonstrating
Causal end to end: a `user-onboarding` workflow that creates an account,
requires email verification, runs an (automated) compliance/KYC check, and
— only for applicants flagged as high-risk — suspends for a human
compliance officer's sign-off before activating the account.

#### The workflow

```ts
@Injectable()
export class OnboardingService {
  @Workflow({ name: 'user-onboarding' })
  async onboard(input: OnboardUserInput, ctx: CausalContext): Promise<OnboardUserOutput> {
    const account = await this.createAccount(input);

    await this.sendVerificationEmail({ userId: account.userId, email: account.email });
    await ctx.awaitAttestation<EmailVerifiedSignal>('email-verified');

    const { riskScore } = await ctx.step('run-compliance-check', () =>
      this.runComplianceCheck(input),
    );

    const requiredComplianceReview = riskScore >= HIGH_RISK_SCORE_THRESHOLD; // 70
    if (requiredComplianceReview) {
      const approval = await ctx.awaitAttestation<ComplianceApprovalSignal>('compliance-approval');
      if (!approval.approved) {
        throw new Error(`Onboarding rejected by compliance reviewer "${approval.reviewer}"`);
      }
    }

    const { activatedAt } = await this.activateAccount({ userId: account.userId });
    return { userId: account.userId, status: 'ACTIVE', activatedAt, requiredComplianceReview };
  }

  @Recordable()
  async createAccount(input: OnboardUserInput) { /* ... */ }

  @Recordable()
  async sendVerificationEmail(params: { userId: string; email: string }) { /* ... */ }

  // Deliberately *not* @Recordable — called explicitly via ctx.step() below,
  // to show the manual form (useful when the step name should differ from
  // the method name).
  async runComplianceCheck(input: OnboardUserInput) { /* ... */ }

  @Recordable()
  async activateAccount(params: { userId: string }) { /* ... */ }
}
```

Because every side effect and gate is recorded in the run's journal, a crash
or restart between any two steps resumes exactly where it left off:
completed steps are never re-run, and pending gates stay durably suspended
until the matching signal arrives.

#### REST endpoints

All routes are under `@Controller('onboarding')`, with
`RedactResponseInterceptor` applied at the controller level (masking
`dateOfBirth`, configured via `CausalModule.forRootAsync`'s `redactFields`).

| Method & path | Body | Effect |
| --- | --- | --- |
| `POST /onboarding` | `CreateOnboardingDto` (+ optional `Idempotency-Key` header) | Starts `user-onboarding` with `correlationKey: onboarding:${email}`. Returns `202 { runId, status, correlationKey }`. |
| `POST /onboarding/:runId/email-verified` | — | Signals `email-verified` with `{ verifiedAt }`. Returns `{ run, events }`. |
| `POST /onboarding/:runId/compliance-approval` | `ComplianceApprovalDto` | Signals `compliance-approval` with `{ approved, reviewer, notes }`. Only ever awaited for high-risk runs. |
| `GET /onboarding/by-email/:email` | — | Latest run for that email's correlation key, or 404. |
| `GET /onboarding/:runId` | — | `{ run, events }` — status plus the full redacted journal, or 404. |

**`CreateOnboardingDto`**: `email` (trimmed/lowercased, `@IsEmail()`),
`fullName` (`@IsString() @IsNotEmpty() @MaxLength(200)`), `dateOfBirth`
(`@IsISO8601({ strict: true })`).

**`ComplianceApprovalDto`**: `approved` (boolean), `reviewer` (string, max
200 chars), `notes` (optional string, max 500 chars).

A custom `dtoValidationPipe(expectedType)` configures Nest's
`ValidationPipe` with an explicit `expectedType`, `whitelist: true`, and
`forbidNonWhitelisted: true` — this app's build toolchain doesn't emit
TypeScript's `design:paramtypes` metadata, so the DTO type is pinned
explicitly rather than inferred, and undeclared extra fields are rejected
rather than silently dropped.

#### Storage

`resolveExampleStorage()` picks the adapter at startup:

- No `CAUSAL_DATABASE_URL` → `InMemoryStorageAdapter` (state lost on
  restart) — the zero-config default.
- `CAUSAL_DATABASE_URL` set → dynamically loads the generated local Prisma
  SQLite client and returns `new PrismaStorageAdapter(prisma)`.

```bash
pnpm --filter @causal/example-api generate:sqlite
```

generates that client from `prisma/schema.prisma`.

#### Running it

```bash
pnpm --filter @causal/example-api dev
```

Listens on `http://localhost:3000` (override with `PORT`). Interactive
Swagger UI is served at `http://localhost:3000/docs`.

#### Walkthrough: a high-risk applicant

Start a run (this email is deterministically hashed to a high risk score in
this example's compliance check):

```bash
curl -i -X POST http://localhost:3000/onboarding \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: alice-onboarding-001' \
  -d '{"email":"alice@example.com","fullName":"Alice Doe","dateOfBirth":"1985-03-14"}'
```

Response: `{ "runId": "...", "status": "WAITING_ATTESTATION", "correlationKey": "onboarding:alice@example.com" }`.

Inspect it:

```bash
RUN_ID='<runId from the response above>'
curl -s "http://localhost:3000/onboarding/$RUN_ID"
```

Signal email verification — the run then proceeds to the compliance check
and (being high-risk) suspends again at `compliance-approval`:

```bash
curl -i -X POST "http://localhost:3000/onboarding/$RUN_ID/email-verified"
```

Approve the compliance review:

```bash
curl -i -X POST "http://localhost:3000/onboarding/$RUN_ID/compliance-approval" \
  -H 'Content-Type: application/json' \
  -d '{"approved":true,"reviewer":"compliance-bot","notes":"Documents reviewed"}'
```

Check the final status and full journal:

```bash
curl -s "http://localhost:3000/onboarding/$RUN_ID"
```

A **low-risk** applicant (e.g. `low-risk@example.com`) skips the
`compliance-approval` gate entirely — email verification proceeds directly
through account activation.

You can also look a run up without its ID:

```bash
curl -s "http://localhost:3000/onboarding/by-email/alice@example.com"
```
