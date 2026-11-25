import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { InProcessPakisoEngine } from '@pakiso/core';
import { PrismaStorageAdapter } from '@pakiso/storage-prisma';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { schemaPathFor, storagePrismaDir } from '../dialect.js';
import { runReplay } from './replay.js';

const dbPath = fileURLToPath(new URL('../../replay-test.db', import.meta.url));
const databaseUrl = `file:${dbPath}`;
const configDir = storagePrismaDir();
const configPath = `${configDir}/pakiso.config.mjs`;

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
    { cwd: configDir, env: { ...process.env, PAKISO_DATABASE_URL: databaseUrl }, stdio: 'pipe' },
  );

  writeFileSync(
    configPath,
    `
    import { InProcessPakisoEngine } from '@pakiso/core';
    import { PrismaStorageAdapter } from '@pakiso/storage-prisma';
    import { PrismaClient } from './generated/sqlite/index.js';

    const prisma = new PrismaClient({ datasourceUrl: process.env.PAKISO_DATABASE_URL });
    const storage = new PrismaStorageAdapter(prisma);
    const engine = new InProcessPakisoEngine({ storage });

    engine.registerWorkflow('checkout', async (input, ctx) => {
      const charge = await ctx.step('charge-card', async () => ({ chargeId: 'ch_real' }));
      return { orderId: input.orderId, chargeId: charge.chargeId };
    });

    export default engine;
    `,
  );
}, 30_000);

afterAll(() => {
  if (existsSync(dbPath)) {
    rmSync(dbPath);
  }
  if (existsSync(configPath)) {
    rmSync(configPath);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function seedRun() {
  const { PrismaClient } = (await import(
    pathToFileURL(`${storagePrismaDir()}/generated/sqlite/index.js`).href
  )) as {
    PrismaClient: new (options: { datasourceUrl: string }) => { $disconnect(): Promise<void> };
  };
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  // biome-ignore lint/suspicious/noExplicitAny: structurally compatible, see PrismaPakisoClient
  const storage = new PrismaStorageAdapter(prisma as any);
  const engine = new InProcessPakisoEngine({ storage });
  engine.registerWorkflow('checkout', async (input: { orderId: string }, ctx) => {
    const charge = await ctx.step('charge-card', async () => ({ chargeId: 'ch_real' }));
    return { orderId: input.orderId, chargeId: charge.chargeId };
  });
  const run = await engine.startWorkflow({ workflowName: 'checkout', input: { orderId: 'ORD-1' } });
  await prisma.$disconnect();
  return run;
}

describe('runReplay', () => {
  it('replays a run against pakiso.config.mjs and prints its output', async () => {
    const previousUrl = process.env.PAKISO_DATABASE_URL;
    process.env.PAKISO_DATABASE_URL = databaseUrl;
    const run = await seedRun();

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await runReplay(run.id, {}, configDir);
    } finally {
      if (previousUrl === undefined) {
        // biome-ignore lint/performance/noDelete: process.env requires delete; assigning undefined stringifies to "undefined"
        delete process.env.PAKISO_DATABASE_URL;
      } else {
        process.env.PAKISO_DATABASE_URL = previousUrl;
      }
    }

    const printed = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(printed).toContain('Replay completed');
    expect(printed).toContain('ch_real');
  });

  it('applies a --stub override to the replayed output without persisting it', async () => {
    const previousUrl = process.env.PAKISO_DATABASE_URL;
    process.env.PAKISO_DATABASE_URL = databaseUrl;
    const run = await seedRun();

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await runReplay(run.id, { 'charge-card': { chargeId: 'ch_stubbed' } }, configDir);
    } finally {
      if (previousUrl === undefined) {
        // biome-ignore lint/performance/noDelete: process.env requires delete; assigning undefined stringifies to "undefined"
        delete process.env.PAKISO_DATABASE_URL;
      } else {
        process.env.PAKISO_DATABASE_URL = previousUrl;
      }
    }

    const printed = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(printed).toContain('ch_stubbed');
  });
});
