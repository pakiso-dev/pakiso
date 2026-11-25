# Prisma adapter

`@pakiso/storage-prisma` implements `PakisoStorageAdapter` using Prisma,
supporting PostgreSQL, MySQL, and SQLite via three independent, portable
schema files rather than one provider-switched schema.

```bash
pnpm add @pakiso/storage-prisma
```

#### Schemas

```
packages/storage-prisma/prisma/
├── postgresql.prisma
├── mysql.prisma
└── sqlite.prisma
```

The three schemas declare byte-for-byte identical models (only the
`datasource`/`generator` blocks differ, plus MySQL marks `PakisoRun.error`
as `@db.Text`), so the generated client surface is interchangeable across
dialects. `PrismaStorageAdapter` is typed against a reduced
`PrismaPakisoClient` structural contract rather than any one dialect's full
generated client type, so it works with whichever one you generate.

Each schema defines:

- **`PakisoRun`** (`pakiso_runs`) — run metadata, JSON `input`/`output`,
  `status`, timestamps, lease fields, `attestationExpiresAt`. Unique on
  `[workflowName, idempotencyKey]`; indexed on `[workflowName,
  correlationKey]` and `[status, attestationExpiresAt]`.
- **`PakisoEvent`** (`pakiso_events`) — the per-run journal, with a relation
  to `PakisoRun`. Unique on `[runId, seq]`.

#### Setting up a database

Set `PAKISO_DATABASE_URL`, then generate the client and apply the schema
for your dialect:

```bash
PAKISO_DATABASE_URL="postgresql://user:pass@host:5432/db" \
  npx prisma generate --schema=node_modules/@pakiso/storage-prisma/prisma/postgresql.prisma
PAKISO_DATABASE_URL="postgresql://user:pass@host:5432/db" \
  npx prisma db push --schema=node_modules/@pakiso/storage-prisma/prisma/postgresql.prisma
```

Swap `postgresql.prisma` for `mysql.prisma` or `sqlite.prisma` as needed.
[`pakiso init`](/cli/overview#pakiso-init) from `@pakiso/cli` automates
dialect detection and schema application from `PAKISO_DATABASE_URL` — use
it instead of the manual `prisma` commands above where convenient.

The client your app imports at runtime is a separate copy you generate
yourself from your own schema file — `pakiso init` only applies the schema
to the database and generates a client for the CLI's own internal use. See
[Deployment](/fundamentals/deployment) for the full picture, including how
this fits into CI/CD for a multi-replica deployment.

#### Usage

```ts
import { PrismaClient } from './generated/postgresql/index.js';
import { PrismaStorageAdapter } from '@pakiso/storage-prisma';
import { InProcessPakisoEngine } from '@pakiso/core';

const prisma = new PrismaClient();
const storage = new PrismaStorageAdapter(prisma);
const engine = new InProcessPakisoEngine({ storage });

engine.registerWorkflow('checkout', async (input, ctx) => {
  // ...
});
```

```ts
class PrismaStorageAdapter implements PakisoStorageAdapter {
  constructor(prisma: PrismaPakisoClient);
}
```

With `@pakiso/nest`, pass the adapter instance as `storage` in
[`PakisoModule.forRoot`/`forRootAsync`](/nestjs/module):

```ts
PakisoModule.forRootAsync({
  useFactory: () => ({ storage: new PrismaStorageAdapter(prisma) }),
});
```

#### Verifying the adapter

The package's own test suite generates a SQLite client automatically (via
`pretest`/`prebuild` hooks) and runs the full
`runStorageConformanceTests()` suite from `@pakiso/core/testing` against a
real, file-based SQLite database — no external services required:

```bash
pnpm --filter @pakiso/storage-prisma test
```

To additionally verify against real Postgres/MySQL (useful locally with
Docker, not run in default CI):

```bash
PAKISO_DATABASE_URL="postgresql://..." pnpm test:postgresql
PAKISO_DATABASE_URL="mysql://..." pnpm test:mysql
```
