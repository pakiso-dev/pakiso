import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Aes256GcmPayloadCodec } from './aes-256-gcm-payload-codec.js';
import { CodedStorageAdapter } from './coded-storage-adapter.js';
import { InMemoryStorageAdapter } from './in-memory-storage-adapter.js';
import type { CausalStorageAdapter } from './storage.js';

function createCodedAdapter() {
  const inner = new InMemoryStorageAdapter();
  const codec = new Aes256GcmPayloadCodec({
    activeKey: { kid: 'k1', key: randomBytes(32).toString('base64') },
  });
  return { inner, adapter: new CodedStorageAdapter(inner, codec) };
}

describe('CodedStorageAdapter', () => {
  it('encrypts run input at rest and decrypts it transparently on read', async () => {
    const { inner, adapter } = createCodedAdapter();

    const { run } = await adapter.createOrGetRun({
      workflowName: 'order-fulfillment',
      input: { orderId: 'ORD-1', cardNumber: '4111111111111111' },
    });

    const rawRun = await inner.getRun(run.id);
    expect(rawRun?.input.__causalEnc).toBe(true);
    expect(JSON.stringify(rawRun?.input)).not.toContain('4111111111111111');

    const decoded = await adapter.getRun(run.id);
    expect(decoded?.input).toEqual({ orderId: 'ORD-1', cardNumber: '4111111111111111' });
  });

  it('encrypts event payloads at rest and decrypts them transparently on read', async () => {
    const { inner, adapter } = createCodedAdapter();
    const { run } = await adapter.createOrGetRun({ workflowName: 'wf', input: {} });

    await adapter.appendEvent({
      runId: run.id,
      expectedSeq: 0,
      type: 'STEP_COMPLETED',
      stepName: 'charge-card',
      payload: { chargeId: 'ch_1' },
    });

    const [rawEvent] = await inner.getEvents(run.id);
    expect(rawEvent?.payload.__causalEnc).toBe(true);

    const [decodedEvent] = await adapter.getEvents(run.id);
    expect(decodedEvent?.payload).toEqual({ chargeId: 'ch_1' });
  });

  it('encrypts run output at rest and decrypts it transparently on read', async () => {
    const { inner, adapter } = createCodedAdapter();
    const { run } = await adapter.createOrGetRun({ workflowName: 'wf', input: {} });

    await adapter.updateRunStatus({
      runId: run.id,
      status: 'COMPLETED',
      output: { ok: true },
    });

    const rawRun = await inner.getRun(run.id);
    expect(rawRun?.output?.__causalEnc).toBe(true);

    const decoded = await adapter.getRun(run.id);
    expect(decoded?.output).toEqual({ ok: true });
  });

  it('leaves output untouched when updateRunStatus does not set it', async () => {
    const { adapter } = createCodedAdapter();
    const { run } = await adapter.createOrGetRun({ workflowName: 'wf', input: {} });

    const updated = await adapter.updateRunStatus({ runId: run.id, status: 'FAILED' });

    expect(updated.output).toBeNull();
  });

  it('returns null from getRun and getLatestRunByCorrelationKey for unknown lookups', async () => {
    const { adapter } = createCodedAdapter();

    expect(await adapter.getRun('does-not-exist')).toBeNull();
    expect(await adapter.getLatestRunByCorrelationKey('wf', 'does-not-exist')).toBeNull();
  });

  it('delegates connect()/disconnect() to the wrapped adapter when present', async () => {
    let connected = false;
    let disconnected = false;
    const inner: CausalStorageAdapter = {
      connect: async () => {
        connected = true;
      },
      disconnect: async () => {
        disconnected = true;
      },
      createOrGetRun: async () => {
        throw new Error('not implemented in this test double');
      },
      getRun: async () => null,
      getLatestRunByCorrelationKey: async () => null,
      getEvents: async () => [],
      appendEvent: async () => {
        throw new Error('not implemented in this test double');
      },
      updateRunStatus: async () => {
        throw new Error('not implemented in this test double');
      },
    };
    const codec = new Aes256GcmPayloadCodec({
      activeKey: { kid: 'k1', key: randomBytes(32).toString('base64') },
    });
    const adapter = new CodedStorageAdapter(inner, codec);

    await adapter.connect();
    await adapter.disconnect();

    expect(connected).toBe(true);
    expect(disconnected).toBe(true);
  });
});
