# @pakiso/cli

Developer CLI for Pakiso: schema bootstrapping and local trace debugging.

## Commands

### `pakiso init`

Reads `PAKISO_DATABASE_URL`, auto-detects the dialect (PostgreSQL/MySQL/SQLite),
generates the matching Prisma client, applies the schema (`prisma db push`), and
— for PostgreSQL only — installs the append-only `prevent_event_mutation`
trigger on `pakiso_events`.

```bash
PAKISO_DATABASE_URL="postgresql://user:pass@host:5432/db" npx pakiso init
```

### `pakiso inspect <runId>`

Prints a run's metadata and its full event journal (including per-step
`durationMs`), reading from `PAKISO_DATABASE_URL`.

```bash
PAKISO_DATABASE_URL="file:./dev.db" npx pakiso inspect <runId>
```

### `pakiso replay <runId> [--stub stepName=jsonValue]`

Replays a recorded run locally against your project's real workflow handlers,
without mutating the stored run, optionally overriding specific steps'
results to reproduce bugs deterministically.

```bash
PAKISO_DATABASE_URL="file:./dev.db" npx pakiso replay <runId> \
  --stub 'charge-card={"chargeId":"test_123"}'
```

`pakiso replay` loads your project's workflow handlers from a
**`pakiso.config.mjs`** (or `.js`) file in the current working directory. It
must default-export either a fully configured `PakisoEngine` instance, or an
(async) factory function returning one:

```javascript
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
