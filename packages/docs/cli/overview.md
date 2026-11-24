# causal init / inspect / replay

`@causal/cli` is the developer CLI for Causal: Prisma schema bootstrapping
and local run inspection/replay. Install it as a dev dependency:

```bash
pnpm add -D @causal/cli
```

The binary is named `causal` (`package.json`'s `bin.causal`).

#### `causal init`

Reads `CAUSAL_DATABASE_URL`, auto-detects the dialect (PostgreSQL, MySQL, or
SQLite from the URL scheme), generates the matching
[`@causal/storage-prisma`](/storage/prisma-adapter) client, applies the
schema (`prisma db push --skip-generate`), and — for PostgreSQL only —
installs an append-only `prevent_event_mutation` trigger on `causal_events`.

```bash
CAUSAL_DATABASE_URL="postgresql://user:pass@host:5432/db" npx causal init
```

Prints progress and `✔ causal init complete` on success. Fails with
`CAUSAL_DATABASE_URL must be set before running "causal init".` if the
variable is missing.

Note that the client it generates is only consumed by `causal
inspect`/`causal replay` themselves — it is unrelated to the Prisma client
your own application imports. See [Deployment](/fundamentals/deployment)
for how `causal init` fits into a full build/release sequence.

#### `causal inspect <runId>`

Prints a run's metadata and its full event journal — `seq`, `type`,
step/gate name, `durationMs`, `createdAt` — reading from
`CAUSAL_DATABASE_URL` directly (no `causal.config.mjs` required).

```bash
CAUSAL_DATABASE_URL="file:./dev.db" npx causal inspect <runId>
```

Prints `No run found with id "<runId>"` if the run doesn't exist.

#### `causal replay <runId>`

Replays a recorded run locally against **your project's real workflow
handlers**, without mutating the stored run — see
[Replay](/fundamentals/replay) for what replay means at the engine level.

```bash
CAUSAL_DATABASE_URL="file:./dev.db" npx causal replay <runId> \
  --stub 'charge-card={"chargeId":"test_123"}'
```

`--stub stepName=jsonValue` is repeatable; each value is parsed with
`JSON.parse`, falling back to the raw string if that fails. All `--stub`
assignments are merged into one stubs object passed to `engine.replayRun`.

Unlike `init`/`inspect`, `replay` needs your actual registered workflow
handlers (not just the storage adapter), so it loads a
**`causal.config.mjs`** (or `.js`) file from the current working directory.
That file must default-export either a fully configured `CausalEngine`
instance, or an (async) factory function returning one:

```js
// causal.config.mjs
import { InProcessCausalEngine } from '@causal/core';
import { PrismaStorageAdapter } from '@causal/storage-prisma';
import { PrismaClient } from './generated/sqlite/index.js';

const prisma = new PrismaClient({ datasourceUrl: process.env.CAUSAL_DATABASE_URL });
const engine = new InProcessCausalEngine({ storage: new PrismaStorageAdapter(prisma) });

engine.registerWorkflow('checkout', async (input, ctx) => {
  /* ... */
});

export default engine;
```

The loader validates that the resolved export looks like a `CausalEngine`
(has `replayRun` and `registerWorkflow` methods) before using it.

#### How `CAUSAL_DATABASE_URL` selects a dialect

`init` and `inspect` (and the config-less path for building a storage
adapter) detect the dialect from the URL scheme:

| URL prefix | Dialect |
| --- | --- |
| `postgres://`, `postgresql://` | `postgresql` |
| `mysql://` | `mysql` |
| `file:`, `sqlite:` | `sqlite` |

If the matching generated Prisma client isn't present yet, the CLI directs
you to run `causal init` first.

#### Other flags

```bash
npx causal --version
```
