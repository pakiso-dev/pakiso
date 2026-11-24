# @causal/cli

Developer CLI for Causal: schema bootstrapping and local trace debugging.

## Commands

### `causal init`

Reads `CAUSAL_DATABASE_URL`, auto-detects the dialect (PostgreSQL/MySQL/SQLite),
generates the matching Prisma client, applies the schema (`prisma db push`), and
— for PostgreSQL only — installs the append-only `prevent_event_mutation`
trigger on `causal_events`.

```bash
CAUSAL_DATABASE_URL="postgresql://user:pass@host:5432/db" npx causal init
```

### `causal inspect <runId>`

Prints a run's metadata and its full event journal (including per-step
`durationMs`), reading from `CAUSAL_DATABASE_URL`.

```bash
CAUSAL_DATABASE_URL="file:./dev.db" npx causal inspect <runId>
```

### `causal replay <runId> [--stub stepName=jsonValue]`

Replays a recorded run locally against your project's real workflow handlers,
without mutating the stored run, optionally overriding specific steps'
results to reproduce bugs deterministically.

```bash
CAUSAL_DATABASE_URL="file:./dev.db" npx causal replay <runId> \
  --stub 'charge-card={"chargeId":"test_123"}'
```

`causal replay` loads your project's workflow handlers from a
**`causal.config.mjs`** (or `.js`) file in the current working directory. It
must default-export either a fully configured `CausalEngine` instance, or an
(async) factory function returning one:

```javascript
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
