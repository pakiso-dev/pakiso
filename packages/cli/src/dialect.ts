import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export type CausalDialect = 'postgresql' | 'mysql' | 'sqlite';

/** Detects the Prisma dialect from a CAUSAL_DATABASE_URL connection string. */
export function detectDialect(databaseUrl: string): CausalDialect {
  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) {
    return 'postgresql';
  }
  if (databaseUrl.startsWith('mysql://')) {
    return 'mysql';
  }
  if (databaseUrl.startsWith('file:') || databaseUrl.startsWith('sqlite:')) {
    return 'sqlite';
  }
  throw new Error(
    `Cannot detect a Causal dialect from CAUSAL_DATABASE_URL "${databaseUrl}". Expected a postgresql://, mysql://, or file: connection string.`,
  );
}

const require = createRequire(import.meta.url);

/** Resolves the installed @causal/storage-prisma package directory. */
export function storagePrismaDir(): string {
  const packageJsonPath = require.resolve('@causal/storage-prisma/package.json');
  return dirname(packageJsonPath);
}

export function schemaPathFor(dialect: CausalDialect): string {
  return join(storagePrismaDir(), 'prisma', `${dialect}.prisma`);
}

export function generatedClientPathFor(dialect: CausalDialect): string {
  return join(storagePrismaDir(), 'generated', dialect, 'index.js');
}

/** Only PostgreSQL gets the append-only trigger; returns null for other dialects. */
export function triggerSqlPathFor(dialect: CausalDialect): string | null {
  return dialect === 'postgresql'
    ? join(storagePrismaDir(), 'prisma', 'postgresql-prevent-event-mutation.sql')
    : null;
}
