import { describe, expect, it } from 'vitest';
import { InMemoryStorageAdapter } from './in-memory-storage-adapter.js';

describe('InMemoryStorageAdapter leases', () => {
  it('grants a lease when none is held', async () => {
    const storage = new InMemoryStorageAdapter();
    const granted = await storage.acquireLease({
      runId: 'run-1',
      leaseOwner: 'worker-a',
      leaseDurationMs: 10_000,
    });
    expect(granted).toBe(true);
  });

  it('rejects a lease held by a different owner before it expires', async () => {
    const storage = new InMemoryStorageAdapter();
    await storage.acquireLease({ runId: 'run-1', leaseOwner: 'worker-a', leaseDurationMs: 10_000 });

    const grantedToB = await storage.acquireLease({
      runId: 'run-1',
      leaseOwner: 'worker-b',
      leaseDurationMs: 10_000,
    });
    expect(grantedToB).toBe(false);
  });

  it('allows the same owner to re-acquire (renew) its own lease', async () => {
    const storage = new InMemoryStorageAdapter();
    await storage.acquireLease({ runId: 'run-1', leaseOwner: 'worker-a', leaseDurationMs: 10_000 });

    const renewed = await storage.acquireLease({
      runId: 'run-1',
      leaseOwner: 'worker-a',
      leaseDurationMs: 10_000,
    });
    expect(renewed).toBe(true);
  });

  it('allows a new owner to acquire once the previous lease has expired', async () => {
    const storage = new InMemoryStorageAdapter();
    await storage.acquireLease({ runId: 'run-1', leaseOwner: 'worker-a', leaseDurationMs: -1 });

    const grantedToB = await storage.acquireLease({
      runId: 'run-1',
      leaseOwner: 'worker-b',
      leaseDurationMs: 10_000,
    });
    expect(grantedToB).toBe(true);
  });

  it('releaseLease only clears the lease if the caller is the current owner', async () => {
    const storage = new InMemoryStorageAdapter();
    await storage.acquireLease({ runId: 'run-1', leaseOwner: 'worker-a', leaseDurationMs: 10_000 });

    // A different owner's release must not clear worker-a's lease.
    await storage.releaseLease({ runId: 'run-1', leaseOwner: 'worker-b' });
    const stillHeldByA = await storage.acquireLease({
      runId: 'run-1',
      leaseOwner: 'worker-b',
      leaseDurationMs: 10_000,
    });
    expect(stillHeldByA).toBe(false);

    await storage.releaseLease({ runId: 'run-1', leaseOwner: 'worker-a' });
    const grantedToBAfterRelease = await storage.acquireLease({
      runId: 'run-1',
      leaseOwner: 'worker-b',
      leaseDurationMs: 10_000,
    });
    expect(grantedToBAfterRelease).toBe(true);
  });
});
