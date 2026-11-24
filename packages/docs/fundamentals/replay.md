# Replay

Replay reruns a workflow handler against a run's **recorded journal**,
without executing recorded step callbacks or persisting anything new. It
exists for two purposes: verifying that a handler is still compatible with
in-flight runs, and reproducing a bug locally with optional step overrides.

#### `engine.replayRun(runId, stubs?)`

```ts
const replayed = await engine.replayRun(runId);
console.log(replayed.status); // 'COMPLETED' | 'WAITING_ATTESTATION' | 'FAILED' | ...
console.log(replayed.output);
```

The engine re-executes the registered handler for that run's
`workflowName` from the top. Every `ctx.step()` and `ctx.awaitAttestation()`
call matches against the journal by sequence and step/gate name and returns
the recorded value — the callback passed to `step()` is **not** invoked. If
the handler's code now takes a different path than what's journaled (a
different step name at a given sequence number), replay throws
`CausalDivergenceError`.

A run still suspended at a gate when it was recorded replays with status
`'WAITING_ATTESTATION'` — replay doesn't resolve open gates for you.

#### Overriding a step's result with `stubs`

```ts
const replayed = await engine.replayRun(runId, {
  'charge-card': { chargeId: 'test_123' },
});
```

Pass a map of step name → stub value. This is the main tool for
reproducing a bug deterministically: force a specific step (e.g. a flaky
external call) to return a known value, then observe how the rest of the
handler behaves with your current code.

#### `causal replay` CLI command

The [`@causal/cli`](/cli/overview) package wraps `replayRun` as a terminal
command, loading your project's real engine + registered workflows from a
`causal.config.mjs` file:

```bash
CAUSAL_DATABASE_URL="file:./dev.db" npx causal replay <runId> \
  --stub 'charge-card={"chargeId":"test_123"}'
```

`--stub` is repeatable; each one has the form `stepName=jsonValue`
(`jsonValue` is parsed with `JSON.parse`, falling back to a raw string if
parsing fails). See [the CLI page](/cli/overview#causal-replay-runid) for
the full `causal.config.mjs` contract.
