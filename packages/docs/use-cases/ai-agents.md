# AI agents & human-in-the-loop

Pakiso wasn't built for agents specifically — `ctx.step()` and
`ctx.awaitAttestation()` don't know or care whether the code calling them is
an HTTP handler driven by a human, or a tool-calling loop driven by an LLM.
But that generality turns out to fit an agent loop unusually well: an agent
that can take real-world actions (issue a refund, send an email, delete a
record) has exactly the same two problems a long-running business workflow
does — **surviving a crash mid-action**, and **pausing for a human or
policy check before an irreversible action fires** — plus a third problem
business workflows don't usually have: **the thing deciding what to do next
is non-deterministic**.

#### Why agent loops need durable execution

An agent loop typically looks like: call a model, get back a proposed
action, call a tool, feed the result back to the model, repeat. Two things
make this fragile without durability:

- **Tool calls can be irreversible.** If the process crashes after a refund
  tool call succeeds but before that result is recorded, a naive retry
  re-issues the refund. `ctx.step()` journals a tool call's result the first
  time it runs; every later resume or replay returns the journaled result
  instead of calling the tool again.
- **Model calls are slow, costly, and non-deterministic.** Re-running a
  multi-step agent loop from the top after a crash means re-prompting the
  model for every step already completed — slower, more expensive, and
  liable to produce a *different* decision the second time. Wrapping the
  model call itself in a step journals exactly what the model decided, so
  resume/replay reuses that decision rather than re-prompting.

#### Pairing an agent's decision with a human-approval gate

The pattern is the same `ctx.step()` → `ctx.awaitAttestation()` →
`ctx.step()` shape as any other conditional gate, just with a model call
standing behind the first step instead of a human filling out a form. See
[`@pakiso/example-api`'s `support-refund-agent` workflow](https://github.com/pakiso-dev/pakiso/tree/main/packages/example-api/src/refund-agent)
(walked through in full in the [refund agent recipe](/recipes/refund-agent-walkthrough))
for a complete, runnable version of this:

```ts
// 1. The agent proposes an action. In this example a plain function stands
//    in for the model call so the example is reproducible without an API
//    key — in a real integration this is where you'd call your model/agent
//    framework of choice.
const decision = await ctx.step('classify-with-agent', () => this.classifyWithAgent(input));

if (decision.action === 'DENY') {
  return this.recordDenial({ ticketId: input.ticketId, decision });
}

// 2. Only the agent's *risky* tool call — one that moves money above a
//    threshold — is gated behind a human sign-off. Low-stakes actions the
//    agent is confident about (denials, small refunds) never touch a human.
if (input.refundAmountCents >= AUTO_APPROVE_LIMIT_CENTS) {
  const approval = await ctx.awaitAttestation<HumanApprovalSignal>('human-approval');
  if (!approval.approved) throw new Error('Refund rejected by support lead');
}

// 3. The agent's tool call executes — exactly once per run, regardless of
//    how many times this handler resumes or replays.
return this.issueRefund({ ticketId: input.ticketId, amountCents: input.refundAmountCents });
```

Because the gate sits **between** the model's decision and the tool call
that carries it out, a human reviewing a suspended run sees exactly what the
agent proposed and why — the full journal, not a log line — before it
becomes irreversible.

#### How this compares to other durable-execution and agent tooling

Pakiso sits at the intersection of two existing categories, and borrows
different things from each:

| | Infrastructure | Scope | Audit/compliance journal |
| --- | --- | --- | --- |
| **Pakiso** | BYOS — your own Postgres/MySQL/SQLite/custom adapter, no extra service to run | Durability + attestation gates only; brings no model/tool-calling layer of its own | Native: append-only journal, at-rest encryption, response redaction |
| **General-purpose durable execution** (e.g. Temporal, Restate) | A dedicated service/cluster your code talks to (self-hosted or managed) | General-purpose durable workflows; human-in-the-loop is one of many supported patterns, not the headline | Not a primary focus — durability and throughput are |
| **Agent frameworks with built-in suspend/resume** (e.g. Mastra, LangGraph) | Varies; often bundled with the framework's own runtime | Full agent framework — models, tools, memory, and workflow orchestration together | Not a primary focus |

The practical consequence: if you already have agent/tool-calling code (in
any framework, or none) and just want a durability + approval-gate layer
underneath it, Pakiso adds nothing to operate beyond a database you likely
already run. If you want models, tools, memory, and orchestration bundled
together, a full agent framework is the better starting point — and nothing
stops you from using one *and* wrapping its tool calls in `ctx.step()` for
the durability/audit properties above.

#### When Pakiso is (and isn't) the right fit

Good fit when an agent's action is consequential enough that you want:
durable resume across crashes, a human or policy check before specific tool
calls, and a tamper-evident record of what the agent decided and did about
it — refunds, account changes, outbound communications, anything touching
money or regulated data.

Not the right tool when: you need Pakiso to generate the agent's next
action (it doesn't call models or manage tools/memory — bring your own
agent framework or raw SDK calls), or you need a managed, horizontally
scaling execution cluster out of the box (BYOS means your own database and
its operational characteristics are the scaling boundary).

::: tip
This pairs naturally with [redaction](/fundamentals/redaction) and
[encryption](/fundamentals/encryption) — useful defaults once an agent's
tool-call arguments or a model's reasoning may contain customer PII.
:::
