import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import pc from 'picocolors';
import { detectDialect, schemaPathFor, triggerSqlPathFor } from '../dialect.js';

const require = createRequire(import.meta.url);

/**
 * Resolves the exact `prisma` CLI binary installed as @pakiso/cli's own
 * dependency, rather than shelling out to `npx prisma` — `npx` resolves
 * based on the *caller's* current working directory and can silently fetch
 * an unrelated (and potentially incompatible) version from the registry if
 * no compatible `prisma` is found there.
 */
function resolvePrismaBin(): string {
  const packageJsonPath = require.resolve('prisma/package.json');
  const packageJson = require('prisma/package.json') as { bin?: Record<string, string> };
  const binPath = packageJson.bin?.prisma;
  if (!binPath) {
    throw new Error('Could not resolve the installed "prisma" package\'s CLI entry point.');
  }
  return join(dirname(packageJsonPath), binPath);
}

function run(args: string[]): void {
  execFileSync(process.execPath, [resolvePrismaBin(), ...args], {
    stdio: 'inherit',
    env: process.env,
  });
}

/**
 * Auto-detects the dialect from PAKISO_DATABASE_URL, generates the matching
 * Prisma client, applies the schema idempotently (`prisma db push`), and —
 * for PostgreSQL only — installs the append-only `prevent_event_mutation`
 * trigger on `pakiso_events`.
 */
export async function runInit(): Promise<void> {
  const databaseUrl = process.env.PAKISO_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('PAKISO_DATABASE_URL must be set before running "pakiso init".');
  }

  const dialect = detectDialect(databaseUrl);
  const schemaPath = schemaPathFor(dialect);

  console.log(`${pc.bold('pakiso init')} — dialect: ${pc.cyan(dialect)}`);

  console.log(pc.dim('→ generating Prisma client...'));
  run(['generate', `--schema=${schemaPath}`]);

  console.log(pc.dim('→ applying schema (prisma db push)...'));
  run(['db', 'push', `--schema=${schemaPath}`, '--skip-generate']);

  const triggerSqlPath = triggerSqlPathFor(dialect);
  if (triggerSqlPath) {
    console.log(pc.dim('→ installing append-only trigger on pakiso_events...'));
    run(['db', 'execute', `--schema=${schemaPath}`, `--file=${triggerSqlPath}`]);
  }

  console.log(pc.green('✔ pakiso init complete'));
}
