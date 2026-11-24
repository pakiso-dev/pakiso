import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { InMemoryStorageAdapter } from '@causal/core';
import { PrismaStorageAdapter } from '@causal/storage-prisma';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveExampleStorage } from './storage.js';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const dbPath = fileURLToPath(new URL('../generated/sqlite/storage.test.db', import.meta.url));
const databaseUrl = `file:${dbPath}`;

describe('resolveExampleStorage', () => {
  const originalDatabaseUrl = process.env.CAUSAL_DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      // biome-ignore lint/performance/noDelete: process.env requires delete; assigning undefined stringifies to "undefined"
      delete process.env.CAUSAL_DATABASE_URL;
    } else {
      process.env.CAUSAL_DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('defaults to InMemoryStorageAdapter when CAUSAL_DATABASE_URL is unset', async () => {
    // biome-ignore lint/performance/noDelete: process.env requires delete; assigning undefined stringifies to "undefined"
    delete process.env.CAUSAL_DATABASE_URL;

    const storage = await resolveExampleStorage();

    expect(storage).toBeInstanceOf(InMemoryStorageAdapter);
  });

  it('persists via PrismaStorageAdapter/SQLite when CAUSAL_DATABASE_URL is set', async () => {
    if (existsSync(dbPath)) {
      rmSync(dbPath);
    }
    execFileSync(
      'npx',
      ['prisma', 'db', 'push', '--schema=prisma/schema.prisma', '--skip-generate', '--force-reset'],
      {
        cwd: packageRoot,
        env: { ...process.env, CAUSAL_DATABASE_URL: databaseUrl },
        stdio: 'pipe',
      },
    );
    process.env.CAUSAL_DATABASE_URL = databaseUrl;

    const storage = await resolveExampleStorage();
    try {
      expect(storage).toBeInstanceOf(PrismaStorageAdapter);

      const { run, created } = await storage.createOrGetRun({
        workflowName: 'test-workflow',
        input: { foo: 'bar' },
      });
      expect(created).toBe(true);

      const reloaded = await storage.getRun(run.id);
      expect(reloaded?.workflowName).toBe('test-workflow');
    } finally {
      await storage.disconnect?.();
      if (existsSync(dbPath)) {
        rmSync(dbPath);
      }
    }
  }, 30_000);
});
