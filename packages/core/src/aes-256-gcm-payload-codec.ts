import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { EncryptedEnvelope, PayloadCodec } from './security.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;

export interface EncryptionKey {
  /** Key identifier stamped onto new envelopes so decode() can pick the right key during rotation */
  kid: string;
  /** 32-byte (256-bit) AES key, base64-encoded */
  key: string;
}

export interface Aes256GcmPayloadCodecOptions {
  /** Active key used for encode(); its kid is stamped onto new envelopes */
  activeKey: EncryptionKey;
  /** Additional keys accepted for decode() only (e.g., retired keys during rotation) */
  previousKeys?: EncryptionKey[];
}

/**
 * AES-256-GCM PayloadCodec for at-rest encryption of workflow run/event
 * payloads. Each call to encode() uses a fresh random IV; the resulting
 * envelope records the key id (`kid`) used so historical payloads remain
 * decodable after key rotation — register the retired key via
 * `previousKeys` and decode() will look it up by the envelope's `kid`.
 */
export class Aes256GcmPayloadCodec implements PayloadCodec {
  private readonly activeKid: string;
  private readonly keysByKid = new Map<string, Buffer>();

  constructor(options: Aes256GcmPayloadCodecOptions) {
    this.activeKid = options.activeKey.kid;
    for (const entry of [options.activeKey, ...(options.previousKeys ?? [])]) {
      const keyBuffer = Buffer.from(entry.key, 'base64');
      if (keyBuffer.length !== KEY_LENGTH_BYTES) {
        throw new Error(
          `Encryption key "${entry.kid}" must decode to ${KEY_LENGTH_BYTES} bytes, got ${keyBuffer.length}`,
        );
      }
      this.keysByKid.set(entry.kid, keyBuffer);
    }
  }

  async encode(plain: Record<string, unknown>): Promise<Record<string, unknown>> {
    const key = this.requireKey(this.activeKid);
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const plaintext = Buffer.from(JSON.stringify(plain), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    const envelope: EncryptedEnvelope = {
      __causalEnc: true,
      kid: this.activeKid,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };

    return envelope as unknown as Record<string, unknown>;
  }

  async decode(stored: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!isEncryptedEnvelope(stored)) {
      // Not an envelope produced by this codec (e.g., legacy unencrypted data) — pass through.
      return stored;
    }

    const key = this.requireKey(stored.kid);
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(stored.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(stored.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(stored.ciphertext, 'base64')),
      decipher.final(),
    ]);

    return JSON.parse(plaintext.toString('utf8'));
  }

  private requireKey(kid: string): Buffer {
    const key = this.keysByKid.get(kid);
    if (!key) {
      throw new Error(`No encryption key registered for kid "${kid}"`);
    }
    return key;
  }

  /**
   * Crypto-shredding (GDPR/privacy erasure): permanently forgets a retired
   * key by `kid`, in-memory and irreversibly. Any payload previously
   * encrypted under that key becomes permanently undecryptable by this
   * codec instance — without needing to locate and delete the ciphertext
   * rows themselves, which may be retained for audit purposes. Refuses to
   * forget the *active* key (rotate to a new active key first) since that
   * would also break future `encode()` calls.
   */
  forgetKey(kid: string): void {
    if (kid === this.activeKid) {
      throw new Error(
        `Cannot forget the active encryption key "${kid}" — rotate to a new active key first`,
      );
    }
    this.keysByKid.delete(kid);
  }
}

function isEncryptedEnvelope(
  value: Record<string, unknown>,
): value is Record<string, unknown> & EncryptedEnvelope {
  return (
    value.__causalEnc === true &&
    typeof value.kid === 'string' &&
    typeof value.iv === 'string' &&
    typeof value.tag === 'string' &&
    typeof value.ciphertext === 'string'
  );
}
