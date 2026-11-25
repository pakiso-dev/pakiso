import { describe, expect, it } from 'vitest';
import { createStorageAdapterFromEnv } from './storage-from-env.js';

describe('createStorageAdapterFromEnv', () => {
  it('throws when PAKISO_DATABASE_URL is not set', async () => {
    const previous = process.env.PAKISO_DATABASE_URL;
    // biome-ignore lint/performance/noDelete: process.env requires delete; assigning undefined stringifies to "undefined"
    delete process.env.PAKISO_DATABASE_URL;
    try {
      await expect(createStorageAdapterFromEnv()).rejects.toThrow(
        'PAKISO_DATABASE_URL must be set',
      );
    } finally {
      if (previous !== undefined) {
        process.env.PAKISO_DATABASE_URL = previous;
      }
    }
  });

  it('throws a helpful error when no generated client exists for the dialect', async () => {
    const previous = process.env.PAKISO_DATABASE_URL;
    process.env.PAKISO_DATABASE_URL = 'mysql://user:pass@host:3306/db';
    try {
      // The mysql dialect's client isn't generated in this package's test environment
      // (only sqlite is, via the pretest hook), so this should fail with our own
      // actionable error rather than a raw module-not-found stack trace.
      await expect(createStorageAdapterFromEnv()).rejects.toThrow('Run "pakiso init" first');
    } finally {
      if (previous === undefined) {
        // biome-ignore lint/performance/noDelete: process.env requires delete; assigning undefined stringifies to "undefined"
        delete process.env.PAKISO_DATABASE_URL;
      } else {
        process.env.PAKISO_DATABASE_URL = previous;
      }
    }
  });
});
