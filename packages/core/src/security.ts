/**
 * Payload encryption & security boundary. `PayloadCodec` lets any
 * `PakisoStorageAdapter` be wrapped transparently with at-rest encryption via
 * `CodedStorageAdapter`, and `RedactionOptions` drives HTTP-layer masking.
 */

export interface EncryptedEnvelope {
  __pakisoEnc: true;
  kid: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

export interface PayloadCodec {
  encode(plain: Record<string, unknown>): Promise<Record<string, unknown>>;
  decode(stored: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface RedactionOptions {
  /** Additional case-insensitive field keys to mask as "[REDACTED]" */
  extraKeys?: string[];
}
