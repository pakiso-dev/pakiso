import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { PakisoStorageAdapter } from '@pakiso/core';
import { InMemoryStorageAdapter } from '@pakiso/core';
import type { PrismaPakisoClient } from '@pakiso/storage-prisma';
import { PrismaStorageAdapter } from '@pakiso/storage-prisma';

interface GeneratedSqliteClientModule {
  PrismaClient: new (options: { datasourceUrl: string }) => PrismaPakisoClient;
}

const generatedClientPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'generated',
  'sqlite',
  'index.js',
);

/**
 * Resolves the `PakisoStorageAdapter` this app runs with. Defaults to the
 * zero-config `InMemoryStorageAdapter` (state is lost on restart); set
 * `PAKISO_DATABASE_URL` (e.g. `file:/absolute/path/to/dev.db`) to persist
 * runs via `@pakiso/storage-prisma`/SQLite instead — handy for inspecting
 * runs afterwards with `prisma studio --schema=prisma/schema.prisma`.
 *
 * Mirrors `@pakiso/cli`'s `createStorageAdapterFromEnv()`: the generated
 * client path is computed (not a string literal import) so bundlers don't
 * try to statically resolve/inline a module that may not exist yet (run
 * `pnpm generate:sqlite` first).
 */
export async function resolveExampleStorage(): Promise<PakisoStorageAdapter> {
  const databaseUrl = process.env.PAKISO_DATABASE_URL;
  if (!databaseUrl) {
    return new InMemoryStorageAdapter();
  }

  let clientModule: GeneratedSqliteClientModule;
  try {
    clientModule = (await import(
      pathToFileURL(generatedClientPath).href
    )) as GeneratedSqliteClientModule;
  } catch {
    throw new Error(
      `No generated Prisma client found at ${generatedClientPath}. Run "pnpm --filter @pakiso/example-api generate:sqlite" first.`,
    );
  }

  const prisma = new clientModule.PrismaClient({ datasourceUrl: databaseUrl });
  return new PrismaStorageAdapter(prisma);
}
