import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Aes256GcmPayloadCodec } from './aes-256-gcm-payload-codec.js';

function generateKey(): string {
  return randomBytes(32).toString('base64');
}

describe('Aes256GcmPayloadCodec', () => {
  it('round-trips a payload through encode/decode', async () => {
    const codec = new Aes256GcmPayloadCodec({ activeKey: { kid: 'k1', key: generateKey() } });
    const plain = { orderId: 'ORD-1', amount: 42, nested: { pii: 'secret' } };

    const encoded = await codec.encode(plain);
    expect(encoded.__causalEnc).toBe(true);
    expect(encoded.ciphertext).not.toContain('ORD-1');

    const decoded = await codec.decode(encoded);
    expect(decoded).toEqual(plain);
  });

  it('produces a different ciphertext and iv on each call (random IV)', async () => {
    const codec = new Aes256GcmPayloadCodec({ activeKey: { kid: 'k1', key: generateKey() } });
    const plain = { orderId: 'ORD-1' };

    const first = await codec.encode(plain);
    const second = await codec.encode(plain);

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it('passes through payloads that are not envelopes produced by this codec', async () => {
    const codec = new Aes256GcmPayloadCodec({ activeKey: { kid: 'k1', key: generateKey() } });
    const plain = { orderId: 'ORD-1' };

    expect(await codec.decode(plain)).toEqual(plain);
  });

  it('decodes payloads encrypted under a retired key via previousKeys', async () => {
    const oldKey = { kid: 'k1', key: generateKey() };
    const newKey = { kid: 'k2', key: generateKey() };

    const oldCodec = new Aes256GcmPayloadCodec({ activeKey: oldKey });
    const encoded = await oldCodec.encode({ orderId: 'ORD-1' });

    const rotatedCodec = new Aes256GcmPayloadCodec({
      activeKey: newKey,
      previousKeys: [oldKey],
    });

    expect(await rotatedCodec.decode(encoded)).toEqual({ orderId: 'ORD-1' });
  });

  it('throws when decoding an envelope whose kid is not registered', async () => {
    const codec = new Aes256GcmPayloadCodec({ activeKey: { kid: 'k1', key: generateKey() } });
    const otherCodec = new Aes256GcmPayloadCodec({ activeKey: { kid: 'k2', key: generateKey() } });
    const encoded = await otherCodec.encode({ orderId: 'ORD-1' });

    await expect(codec.decode(encoded)).rejects.toThrow(
      'No encryption key registered for kid "k2"',
    );
  });

  it('rejects a key that does not decode to 32 bytes', () => {
    expect(
      () => new Aes256GcmPayloadCodec({ activeKey: { kid: 'k1', key: 'dG9vc2hvcnQ=' } }),
    ).toThrow('Encryption key "k1" must decode to 32 bytes, got 8');
  });

  describe('forgetKey (crypto-shredding)', () => {
    it('permanently prevents decoding payloads encrypted under a forgotten retired key', async () => {
      const retiredKey = { kid: 'k1', key: generateKey() };
      const activeKey = { kid: 'k2', key: generateKey() };
      const codec = new Aes256GcmPayloadCodec({ activeKey, previousKeys: [retiredKey] });

      const retiredCodecView = new Aes256GcmPayloadCodec({ activeKey: retiredKey });
      const encoded = await retiredCodecView.encode({ ssn: '123-45-6789' });

      // Before forgetting, the rotated codec can still decode old payloads.
      await expect(codec.decode(encoded)).resolves.toEqual({ ssn: '123-45-6789' });

      codec.forgetKey('k1');

      await expect(codec.decode(encoded)).rejects.toThrow(
        'No encryption key registered for kid "k1"',
      );
    });

    it('refuses to forget the currently active key', () => {
      const codec = new Aes256GcmPayloadCodec({ activeKey: { kid: 'k1', key: generateKey() } });

      expect(() => codec.forgetKey('k1')).toThrow(
        'Cannot forget the active encryption key "k1" — rotate to a new active key first',
      );
    });

    it('is a no-op when asked to forget an already-unknown kid', async () => {
      const codec = new Aes256GcmPayloadCodec({ activeKey: { kid: 'k1', key: generateKey() } });

      expect(() => codec.forgetKey('never-registered')).not.toThrow();
      // encode() under the still-active key is unaffected.
      await expect(codec.encode({ a: 1 })).resolves.toMatchObject({ __causalEnc: true });
    });
  });
});
