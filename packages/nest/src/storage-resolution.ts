import { Aes256GcmPayloadCodec, CodedStorageAdapter } from '@causal/core';
import type { CausalStorageAdapter, PayloadCodec } from '@causal/core';
import type { CausalModuleOptions } from './types.js';

const ENCRYPTION_KEY_ENV = 'CAUSAL_ENCRYPTION_KEY';
const ENCRYPTION_KEY_ID_ENV = 'CAUSAL_ENCRYPTION_KEY_ID';
const DEFAULT_ENCRYPTION_KEY_ID = 'default';

/**
 * Resolves `CausalModuleOptions.storage` (an instance or zero-argument
 * constructor) into a concrete adapter, wrapping it in `CodedStorageAdapter`
 * when an explicit `codec` is supplied, or when `CAUSAL_ENCRYPTION_KEY` is
 * set in the environment (defaulting to AES-256-GCM).
 */
export function resolveStorageAdapter(options: CausalModuleOptions): CausalStorageAdapter {
  const base = instantiateStorage(options.storage);
  const codec = options.codec ?? createDefaultCodecFromEnv();
  return codec ? new CodedStorageAdapter(base, codec) : base;
}

function instantiateStorage(storage: CausalModuleOptions['storage']): CausalStorageAdapter {
  return typeof storage === 'function' ? new storage() : storage;
}

function createDefaultCodecFromEnv(): PayloadCodec | undefined {
  const key = process.env[ENCRYPTION_KEY_ENV];
  if (!key) {
    return undefined;
  }
  const kid = process.env[ENCRYPTION_KEY_ID_ENV] ?? DEFAULT_ENCRYPTION_KEY_ID;
  return new Aes256GcmPayloadCodec({ activeKey: { kid, key } });
}
