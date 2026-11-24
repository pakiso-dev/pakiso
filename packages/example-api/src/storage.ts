import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { CausalStorageAdapter } from '@causal/core';
import { InMemoryStorageAdapter } from '@causal/core';
import type { PrismaCausalClient } from '@causal/storage-prisma';
import { PrismaStorageAdapter } from '@causal/storage-prisma';

interface GeneratedSqliteClientModule {
  PrismaClient: new (options: { datasourceUrl: string }) => PrismaCausalClient;
}

const generatedClientPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'generated',
  'sqlite',
  'index.js',
);

/**
 * Resolves the `CausalStorageAdapter` this app runs with. Defaults to the
 * zero-config `InMemoryStorageAdapter` (state is lost on restart); set
 * `CAUSAL_DATABASE_URL` (e.g. `file:/absolute/path/to/dev.db`) to persist
 * runs via `@causal/storage-prisma`/SQLite instead — handy for inspecting
 * runs afterwards with `prisma studio --schema=prisma/schema.prisma`.
 *
 * Mirrors `@causal/cli`'s `createStorageAdapterFromEnv()`: the generated
 * client path is computed (not a string literal import) so bundlers don't
 * try to statically resolve/inline a module that may not exist yet (run
 * `pnpm generate:sqlite` first).
 */
export async function resolveExampleStorage(): Promise<CausalStorageAdapter> {
  const databaseUrl = process.env.CAUSAL_DATABASE_URL;
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
      `No generated Prisma client found at ${generatedClientPath}. Run "pnpm --filter @causal/example-api generate:sqlite" first.`,
    );
  }

  const prisma = new clientModule.PrismaClient({ datasourceUrl: databaseUrl });
  return new PrismaStorageAdapter(prisma);
}
