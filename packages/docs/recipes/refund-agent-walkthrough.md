# Recipe: durable support-refund agent

`@pakiso/example-api` also includes a `support-refund-agent` workflow: an
LLM-driven support agent evaluates a refund request, denying likely-duplicate
claims outright, and — only when it proposes a refund above an auto-approve
limit — suspends for a human support lead's sign-off *before* its refund
tool call executes. See [AI agents & human-in-the-loop](/use-cases/ai-agents)
for the pattern this demonstrates and how it compares to other durable
execution/agent tooling.

#### The workflow

```ts
@Injectable()
export class RefundAgentService {
  @Workflow({ name: 'support-refund-agent' })
  async handleRefundRequest(
    input: RefundRequestInput,
    ctx: PakisoContext,
  ): Promise<RefundRequestOutput> {
    const decision = await ctx.step('classify-with-agent', () => this.classifyWithAgent(input));

    if (decision.action === 'DENY') {
      const { decidedAt } = await this.recordDenial({ ticketId: input.ticketId, decision });
      return { ticketId: input.ticketId, action: 'DENIED', refundedAmountCents: 0, requiredHumanApproval: false, decidedAt };
    }

    const requiredHumanApproval = input.refundAmountCents >= AUTO_APPROVE_LIMIT_CENTS; // $100
    if (requiredHumanApproval) {
      const approval = await ctx.awaitAttestation<HumanApprovalSignal>('human-approval');
      if (!approval.approved) {
        throw new Error(`Refund rejected by support lead "${approval.reviewer}"`);
      }
    }

    const { refundedAmountCents, issuedAt } = await this.issueRefund({
      ticketId: input.ticketId,
      amountCents: input.refundAmountCents,
    });
    return { ticketId: input.ticketId, action: 'REFUNDED', refundedAmountCents, requiredHumanApproval, decidedAt: issuedAt };
  }

  // Stands in for an LLM/agent call — a pure function of the input so this
  // example is reproducible without an API key. Recorded exactly once per
  // run via ctx.step(), so replay/resume reuse the decision rather than
  // re-prompting the model.
  async classifyWithAgent(input: RefundRequestInput) { /* ... */ }

  @Recordable()
  async recordDenial(params: { ticketId: string; decision: AgentDecision }) { /* ... */ }

  // The agent's tool call: the irreversible side effect the human-approval
  // gate protects above AUTO_APPROVE_LIMIT_CENTS.
  @Recordable()
  async issueRefund(params: { ticketId: string; amountCents: number }) { /* ... */ }
}
```

Three branches, all deterministic given the input (no real model call, so
the example runs reproducibly in tests and locally):

- **Reason contains "duplicate"** → the agent denies outright. No gate, no
  tool call.
- **Refund amount below $100** → the agent's refund tool call executes
  immediately. No gate.
- **Refund amount at/above $100** → suspends awaiting `human-approval`
  before the tool call executes. Rejecting it fails the run instead of
  issuing a refund.

#### REST endpoints

All routes are under `@Controller('refund-requests')`, with the same
`RedactResponseInterceptor` applied as the onboarding controller.

| Method & path | Body | Effect |
| --- | --- | --- |
| `POST /refund-requests` | `CreateRefundRequestDto` (+ optional `Idempotency-Key` header) | Starts `support-refund-agent` with `correlationKey: support-refund:${ticketId}`. Returns `202 { runId, status, correlationKey }`. |
| `POST /refund-requests/:runId/human-approval` | `HumanApprovalDto` | Signals `human-approval` with `{ approved, reviewer, notes }`. Only ever awaited for refunds at/above the auto-approve limit. |
| `GET /refund-requests/by-ticket/:ticketId` | — | Latest run for that ticket's correlation key, or 404. |
| `GET /refund-requests/:runId` | — | `{ run, events }` — status plus the full redacted journal, or 404. |

**`CreateRefundRequestDto`**: `ticketId` (string, max 64 chars),
`customerEmail` (`@IsEmail()`), `refundAmountCents` (integer, 1 to
100,000,000), `reason` (string, max 500 chars — what the agent classifies
against).

**`HumanApprovalDto`**: `approved` (boolean), `reviewer` (string, max 200
chars), `notes` (optional string, max 500 chars).

#### Running it

```bash
pnpm --filter @pakiso/example-api dev
```

Listens on `http://localhost:3000` (override with `PORT`); Swagger UI at
`http://localhost:3000/docs` covers this workflow alongside onboarding.

#### Walkthrough: an escalated refund

```bash
curl -s -X POST http://localhost:3000/refund-requests \
  -H 'Content-Type: application/json' \
  -d '{"ticketId":"TCK-1001","customerEmail":"ada@example.com","refundAmountCents":15000,"reason":"Charged twice for the same order"}'
# => { "runId": "...", "status": "WAITING_ATTESTATION", "correlationKey": "support-refund:TCK-1001" }

RUN_ID='<runId from above>'
curl -s "http://localhost:3000/refund-requests/$RUN_ID" | jq

curl -s -X POST "http://localhost:3000/refund-requests/$RUN_ID/human-approval" \
  -H 'Content-Type: application/json' \
  -d '{"approved":true,"reviewer":"support-lead-bot"}'
```

A request under $100 (e.g. `refundAmountCents: 2500`) is auto-approved with
no gate; a `reason` containing the word "duplicate" is denied outright with
no gate either, since the agent never proposes the tool call in the first
place.
