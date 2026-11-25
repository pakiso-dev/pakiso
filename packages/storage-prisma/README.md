# @pakiso/storage-prisma

Multi-dialect Prisma `PakisoStorageAdapter` for Pakiso — PostgreSQL, MySQL, and SQLite.

## Schemas

Three portable schema files live in [`prisma/`](./prisma):

- `prisma/postgresql.prisma`
- `prisma/mysql.prisma`
- `prisma/sqlite.prisma`

They declare byte-for-byte identical models (only `datasource`/`generator` differ),
so the generated TypeScript client surface is interchangeable across dialects —
`PrismaStorageAdapter` works with whichever one you generate, via the reduced
`PrismaPakisoClient` structural contract it's typed against (not Prisma's full
generated client type, which differs subtly per dialect).

## Usage

```bash
# Set PAKISO_DATABASE_URL to your target database, then generate + push schema
# for the matching dialect:
PAKISO_DATABASE_URL="postgresql://user:pass@host:5432/db" \
  npx prisma generate --schema=node_modules/@pakiso/storage-prisma/prisma/postgresql.prisma
PAKISO_DATABASE_URL="postgresql://user:pass@host:5432/db" \
  npx prisma db push --schema=node_modules/@pakiso/storage-prisma/prisma/postgresql.prisma
```

```typescript
import { PrismaClient } from './generated/postgresql/index.js';
import { PrismaStorageAdapter } from '@pakiso/storage-prisma';

const prisma = new PrismaClient();
const storage = new PrismaStorageAdapter(prisma);
```

(`pakiso init` in [`@pakiso/cli`](../cli) automates dialect detection and schema
application from `PAKISO_DATABASE_URL`.)

## Development

The default `pnpm test`/`pnpm build`/`pnpm typecheck` scripts generate the SQLite
client automatically (`pretest`/`prebuild`/`pretypecheck` hooks) and run the full
`runStorageConformanceTests()` suite from `@pakiso/core/testing` against a real,
file-based SQLite database — no external services required.

To additionally verify against real PostgreSQL/MySQL (useful locally if you have
Docker available, not run in default CI):

```bash
PAKISO_DATABASE_URL="postgresql://..." pnpm test:postgresql
PAKISO_DATABASE_URL="mysql://..." pnpm test:mysql
```
