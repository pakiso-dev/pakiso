# Prisma adapter

`@causal/storage-prisma` implements `CausalStorageAdapter` using Prisma,
supporting PostgreSQL, MySQL, and SQLite via three independent, portable
schema files rather than one provider-switched schema.

```bash
pnpm add @causal/storage-prisma
```

#### Schemas

```
packages/storage-prisma/prisma/
├── postgresql.prisma
├── mysql.prisma
└── sqlite.prisma
```

The three schemas declare byte-for-byte identical models (only the
`datasource`/`generator` blocks differ, plus MySQL marks `CausalRun.error`
as `@db.Text`), so the generated client surface is interchangeable across
dialects. `PrismaStorageAdapter` is typed against a reduced
`PrismaCausalClient` structural contract rather than any one dialect's full
generated client type, so it works with whichever one you generate.

Each schema defines:

- **`CausalRun`** (`causal_runs`) — run metadata, JSON `input`/`output`,
  `status`, timestamps, lease fields, `attestationExpiresAt`. Unique on
  `[workflowName, idempotencyKey]`; indexed on `[workflowName,
  correlationKey]` and `[status, attestationExpiresAt]`.
- **`CausalEvent`** (`causal_events`) — the per-run journal, with a relation
  to `CausalRun`. Unique on `[runId, seq]`.

#### Setting up a database

Set `CAUSAL_DATABASE_URL`, then generate the client and apply the schema
for your dialect:

```bash
CAUSAL_DATABASE_URL="postgresql://user:pass@host:5432/db" \
  npx prisma generate --schema=node_modules/@causal/storage-prisma/prisma/postgresql.prisma
CAUSAL_DATABASE_URL="postgresql://user:pass@host:5432/db" \
  npx prisma db push --schema=node_modules/@causal/storage-prisma/prisma/postgresql.prisma
```

Swap `postgresql.prisma` for `mysql.prisma` or `sqlite.prisma` as needed.
[`causal init`](/cli/overview#causal-init) from `@causal/cli` automates
dialect detection and schema application from `CAUSAL_DATABASE_URL` — use
it instead of the manual `prisma` commands above where convenient.

#### Usage

```ts
import { PrismaClient } from './generated/postgresql/index.js';
import { PrismaStorageAdapter } from '@causal/storage-prisma';
import { InProcessCausalEngine } from '@causal/core';

const prisma = new PrismaClient();
const storage = new PrismaStorageAdapter(prisma);
const engine = new InProcessCausalEngine({ storage });

engine.registerWorkflow('checkout', async (input, ctx) => {
  // ...
});
```

```ts
class PrismaStorageAdapter implements CausalStorageAdapter {
  constructor(prisma: PrismaCausalClient);
}
```

With `@causal/nest`, pass the adapter instance as `storage` in
[`CausalModule.forRoot`/`forRootAsync`](/nestjs/module):

```ts
CausalModule.forRootAsync({
  useFactory: () => ({ storage: new PrismaStorageAdapter(prisma) }),
});
```

#### Verifying the adapter

The package's own test suite generates a SQLite client automatically (via
`pretest`/`prebuild` hooks) and runs the full
`runStorageConformanceTests()` suite from `@causal/core/testing` against a
real, file-based SQLite database — no external services required:

```bash
pnpm --filter @causal/storage-prisma test
```

To additionally verify against real Postgres/MySQL (useful locally with
Docker, not run in default CI):

```bash
CAUSAL_DATABASE_URL="postgresql://..." pnpm test:postgresql
CAUSAL_DATABASE_URL="mysql://..." pnpm test:mysql
```
