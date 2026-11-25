import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export type PakisoDialect = 'postgresql' | 'mysql' | 'sqlite';

/** Detects the Prisma dialect from a PAKISO_DATABASE_URL connection string. */
export function detectDialect(databaseUrl: string): PakisoDialect {
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
    `Cannot detect a Pakiso dialect from PAKISO_DATABASE_URL "${databaseUrl}". Expected a postgresql://, mysql://, or file: connection string.`,
  );
}

const require = createRequire(import.meta.url);

/** Resolves the installed @pakiso/storage-prisma package directory. */
export function storagePrismaDir(): string {
  const packageJsonPath = require.resolve('@pakiso/storage-prisma/package.json');
  return dirname(packageJsonPath);
}

export function schemaPathFor(dialect: PakisoDialect): string {
  return join(storagePrismaDir(), 'prisma', `${dialect}.prisma`);
}

export function generatedClientPathFor(dialect: PakisoDialect): string {
  return join(storagePrismaDir(), 'generated', dialect, 'index.js');
}

/** Only PostgreSQL gets the append-only trigger; returns null for other dialects. */
export function triggerSqlPathFor(dialect: PakisoDialect): string | null {
  return dialect === 'postgresql'
    ? join(storagePrismaDir(), 'prisma', 'postgresql-prevent-event-mutation.sql')
    : null;
}
