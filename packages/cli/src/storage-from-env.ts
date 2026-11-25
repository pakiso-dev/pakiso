import { pathToFileURL } from 'node:url';
import type { PakisoStorageAdapter } from '@pakiso/core';
import { PrismaStorageAdapter } from '@pakiso/storage-prisma';
import type { PrismaPakisoClient } from '@pakiso/storage-prisma';
import { detectDialect, generatedClientPathFor } from './dialect.js';

interface GeneratedClientModule {
  PrismaClient: new (options: { datasourceUrl: string }) => PrismaPakisoClient;
}

/**
 * Builds a PrismaStorageAdapter from PAKISO_DATABASE_URL by detecting the
 * dialect and dynamically importing the matching generated client — the one
 * `pakiso init` produces via `prisma generate`.
 */
export async function createStorageAdapterFromEnv(): Promise<PakisoStorageAdapter> {
  const databaseUrl = process.env.PAKISO_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'PAKISO_DATABASE_URL must be set (e.g. postgresql://..., mysql://..., or file:./dev.db)',
    );
  }

  const dialect = detectDialect(databaseUrl);
  const clientPath = generatedClientPathFor(dialect);

  let clientModule: GeneratedClientModule;
  try {
    clientModule = (await import(pathToFileURL(clientPath).href)) as GeneratedClientModule;
  } catch {
    throw new Error(
      `No generated Prisma client found for dialect "${dialect}" at ${clientPath}. Run "pakiso init" first.`,
    );
  }

  const prisma = new clientModule.PrismaClient({ datasourceUrl: databaseUrl });
  return new PrismaStorageAdapter(prisma);
}
