/**
 * Real-database conformance suite for the PostgreSQL dialect. Not run as part
 * of the default `pnpm test` — requires a live PostgreSQL instance.
 *
 * Usage:
 *   PAKISO_DATABASE_URL="postgresql://user:pass@host:5432/db" pnpm test:postgresql
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ConcurrencyConflictError } from '@pakiso/core';
import { runStorageConformanceTests } from '@pakiso/core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- generated on demand by `pnpm generate:postgresql`; not present until then.
import { PrismaClient } from '../generated/postgresql/index.js';
import { PrismaStorageAdapter } from './prisma-storage-adapter.js';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const databaseUrl = process.env.PAKISO_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'PAKISO_DATABASE_URL must point at a live PostgreSQL instance to run this suite (see file header).',
  );
}

let prisma: InstanceType<typeof PrismaClient>;

beforeAll(() => {
  execFileSync(
    'npx',
    [
      'prisma',
      'db',
      'push',
      '--schema=prisma/postgresql.prisma',
      '--skip-generate',
      '--force-reset',
    ],
    { cwd: packageRoot, env: { ...process.env, PAKISO_DATABASE_URL: databaseUrl }, stdio: 'pipe' },
  );
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
}, 30_000);

afterAll(async () => {
  await prisma.$disconnect();
});

async function freshAdapter(): Promise<PrismaStorageAdapter> {
  await prisma.pakisoEvent.deleteMany();
  await prisma.pakisoRun.deleteMany();
  return new PrismaStorageAdapter(prisma);
}

runStorageConformanceTests({ createAdapter: freshAdapter });

describe('PrismaStorageAdapter (PostgreSQL)', () => {
  it('enforces the expectedSeq optimistic concurrency guard under real concurrent writers', async () => {
    const adapter = await freshAdapter();
    const { run } = await adapter.createOrGetRun({ workflowName: 'wf', input: {} });

    const results = await Promise.allSettled([
      adapter.appendEvent({
        runId: run.id,
        expectedSeq: 0,
        type: 'STEP_COMPLETED',
        stepName: 'a',
        payload: {},
      }),
      adapter.appendEvent({
        runId: run.id,
        expectedSeq: 0,
        type: 'STEP_COMPLETED',
        stepName: 'b',
        payload: {},
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConcurrencyConflictError);
  });
});
