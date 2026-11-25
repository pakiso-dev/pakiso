# pakiso init / inspect / replay

`@pakiso/cli` is the developer CLI for Pakiso: Prisma schema bootstrapping
and local run inspection/replay. Install it as a dev dependency:

```bash
pnpm add -D @pakiso/cli
```

The binary is named `pakiso` (`package.json`'s `bin.pakiso`).

#### `pakiso init`

Reads `PAKISO_DATABASE_URL`, auto-detects the dialect (PostgreSQL, MySQL, or
SQLite from the URL scheme), generates the matching
[`@pakiso/storage-prisma`](/storage/prisma-adapter) client, applies the
schema (`prisma db push --skip-generate`), and — for PostgreSQL only —
installs an append-only `prevent_event_mutation` trigger on `pakiso_events`.

```bash
PAKISO_DATABASE_URL="postgresql://user:pass@host:5432/db" npx pakiso init
```

Prints progress and `✔ pakiso init complete` on success. Fails with
`PAKISO_DATABASE_URL must be set before running "pakiso init".` if the
variable is missing.

Note that the client it generates is only consumed by `pakiso
inspect`/`pakiso replay` themselves — it is unrelated to the Prisma client
your own application imports. See [Deployment](/fundamentals/deployment)
for how `pakiso init` fits into a full build/release sequence.

#### `pakiso inspect <runId>`

Prints a run's metadata and its full event journal — `seq`, `type`,
step/gate name, `durationMs`, `createdAt` — reading from
`PAKISO_DATABASE_URL` directly (no `pakiso.config.mjs` required).

```bash
PAKISO_DATABASE_URL="file:./dev.db" npx pakiso inspect <runId>
```

Prints `No run found with id "<runId>"` if the run doesn't exist.

#### `pakiso replay <runId>`

Replays a recorded run locally against **your project's real workflow
handlers**, without mutating the stored run — see
[Replay](/fundamentals/replay) for what replay means at the engine level.

```bash
PAKISO_DATABASE_URL="file:./dev.db" npx pakiso replay <runId> \
  --stub 'charge-card={"chargeId":"test_123"}'
```

`--stub stepName=jsonValue` is repeatable; each value is parsed with
`JSON.parse`, falling back to the raw string if that fails. All `--stub`
assignments are merged into one stubs object passed to `engine.replayRun`.

Unlike `init`/`inspect`, `replay` needs your actual registered workflow
handlers (not just the storage adapter), so it loads a
**`pakiso.config.mjs`** (or `.js`) file from the current working directory.
That file must default-export either a fully configured `PakisoEngine`
instance, or an (async) factory function returning one:

```js
// pakiso.config.mjs
import { InProcessPakisoEngine } from '@pakiso/core';
import { PrismaStorageAdapter } from '@pakiso/storage-prisma';
import { PrismaClient } from './generated/sqlite/index.js';

const prisma = new PrismaClient({ datasourceUrl: process.env.PAKISO_DATABASE_URL });
const engine = new InProcessPakisoEngine({ storage: new PrismaStorageAdapter(prisma) });

engine.registerWorkflow('checkout', async (input, ctx) => {
  /* ... */
});

export default engine;
```

The loader validates that the resolved export looks like a `PakisoEngine`
(has `replayRun` and `registerWorkflow` methods) before using it.

#### How `PAKISO_DATABASE_URL` selects a dialect

`init` and `inspect` (and the config-less path for building a storage
adapter) detect the dialect from the URL scheme:

| URL prefix | Dialect |
| --- | --- |
| `postgres://`, `postgresql://` | `postgresql` |
| `mysql://` | `mysql` |
| `file:`, `sqlite:` | `sqlite` |

If the matching generated Prisma client isn't present yet, the CLI directs
you to run `pakiso init` first.

#### Other flags

```bash
npx pakiso --version
```
