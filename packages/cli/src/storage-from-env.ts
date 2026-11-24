import { pathToFileURL } from 'node:url';
import type { CausalStorageAdapter } from '@causal/core';
import { PrismaStorageAdapter } from '@causal/storage-prisma';
import type { PrismaCausalClient } from '@causal/storage-prisma';
import { detectDialect, generatedClientPathFor } from './dialect.js';

interface GeneratedClientModule {
  PrismaClient: new (options: { datasourceUrl: string }) => PrismaCausalClient;
}

/**
 * Builds a PrismaStorageAdapter from CAUSAL_DATABASE_URL by detecting the
 * dialect and dynamically importing the matching generated client — the one
 * `causal init` produces via `prisma generate`.
 */
export async function createStorageAdapterFromEnv(): Promise<CausalStorageAdapter> {
  const databaseUrl = process.env.CAUSAL_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'CAUSAL_DATABASE_URL must be set (e.g. postgresql://..., mysql://..., or file:./dev.db)',
    );
  }

  const dialect = detectDialect(databaseUrl);
  const clientPath = generatedClientPathFor(dialect);

  let clientModule: GeneratedClientModule;
  try {
    clientModule = (await import(pathToFileURL(clientPath).href)) as GeneratedClientModule;
  } catch {
    throw new Error(
      `No generated Prisma client found for dialect "${dialect}" at ${clientPath}. Run "causal init" first.`,
    );
  }

  const prisma = new clientModule.PrismaClient({ datasourceUrl: databaseUrl });
  return new PrismaStorageAdapter(prisma);
}
