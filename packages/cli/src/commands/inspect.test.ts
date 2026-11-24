import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { InProcessCausalEngine } from '@causal/core';
import { PrismaStorageAdapter } from '@causal/storage-prisma';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { schemaPathFor, storagePrismaDir } from '../dialect.js';
import { runInspect } from './inspect.js';

const dbPath = fileURLToPath(new URL('../../inspect-test.db', import.meta.url));
const databaseUrl = `file:${dbPath}`;

beforeAll(() => {
  if (existsSync(dbPath)) {
    rmSync(dbPath);
  }
  execFileSync(
    'npx',
    [
      'prisma',
      'db',
      'push',
      `--schema=${schemaPathFor('sqlite')}`,
      '--skip-generate',
      '--force-reset',
    ],
    {
      cwd: storagePrismaDir(),
      env: { ...process.env, CAUSAL_DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    },
  );
}, 30_000);

afterAll(() => {
  if (existsSync(dbPath)) {
    rmSync(dbPath);
  }
});

describe('runInspect', () => {
  it('prints a run summary and its event journal', async () => {
    const previousUrl = process.env.CAUSAL_DATABASE_URL;
    process.env.CAUSAL_DATABASE_URL = databaseUrl;

    const { PrismaClient } = (await import(
      pathToFileURL(`${storagePrismaDir()}/generated/sqlite/index.js`).href
    )) as { PrismaClient: new (options: { datasourceUrl: string }) => unknown };
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    // biome-ignore lint/suspicious/noExplicitAny: structurally compatible, see PrismaCausalClient
    const storage = new PrismaStorageAdapter(prisma as any);
    const engine = new InProcessCausalEngine({ storage });
    engine.registerWorkflow('checkout', async (input: { orderId: string }, ctx) => {
      const charge = await ctx.step('charge-card', async () => ({ chargeId: 'ch_1' }));
      return { orderId: input.orderId, chargeId: charge.chargeId };
    });
    const run = await engine.startWorkflow({
      workflowName: 'checkout',
      input: { orderId: 'ORD-1' },
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let printed: string;
    try {
      await runInspect(run.id);
      printed = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      logSpy.mockRestore();
      if (previousUrl === undefined) {
        // biome-ignore lint/performance/noDelete: process.env requires delete; assigning undefined stringifies to "undefined"
        delete process.env.CAUSAL_DATABASE_URL;
      } else {
        process.env.CAUSAL_DATABASE_URL = previousUrl;
      }
    }

    expect(printed).toContain(run.id);
    expect(printed).toContain('checkout');
    expect(printed).toContain('COMPLETED');
    expect(printed).toContain('charge-card');
    expect(printed).toContain('STEP_COMPLETED');
  });

  it('throws for an unknown runId', async () => {
    const previousUrl = process.env.CAUSAL_DATABASE_URL;
    process.env.CAUSAL_DATABASE_URL = databaseUrl;
    try {
      await expect(runInspect('does-not-exist')).rejects.toThrow(
        'No run found with id "does-not-exist"',
      );
    } finally {
      if (previousUrl === undefined) {
        // biome-ignore lint/performance/noDelete: process.env requires delete; assigning undefined stringifies to "undefined"
        delete process.env.CAUSAL_DATABASE_URL;
      } else {
        process.env.CAUSAL_DATABASE_URL = previousUrl;
      }
    }
  });
});
