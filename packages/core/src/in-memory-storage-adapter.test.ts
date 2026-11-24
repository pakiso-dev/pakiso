import { describe, expect, it } from 'vitest';
import { InMemoryStorageAdapter } from './in-memory-storage-adapter.js';

describe('InMemoryStorageAdapter', () => {
  it('rejects appendEvent for an unknown runId', async () => {
    const storage = new InMemoryStorageAdapter();

    await expect(
      storage.appendEvent({
        runId: 'does-not-exist',
        expectedSeq: 0,
        type: 'WORKFLOW_STARTED',
        payload: {},
      }),
    ).rejects.toThrow('Cannot append event: unknown run "does-not-exist"');
  });

  it('rejects updateRunStatus for an unknown runId', async () => {
    const storage = new InMemoryStorageAdapter();

    await expect(
      storage.updateRunStatus({
        runId: 'does-not-exist',
        status: 'COMPLETED',
      }),
    ).rejects.toThrow('Cannot update status: unknown run "does-not-exist"');
  });
});
