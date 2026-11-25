import { Aes256GcmPayloadCodec, CodedStorageAdapter } from '@pakiso/core';
import type { PakisoStorageAdapter, PayloadCodec } from '@pakiso/core';
import type { PakisoModuleOptions } from './types.js';

const ENCRYPTION_KEY_ENV = 'PAKISO_ENCRYPTION_KEY';
const ENCRYPTION_KEY_ID_ENV = 'PAKISO_ENCRYPTION_KEY_ID';
const DEFAULT_ENCRYPTION_KEY_ID = 'default';

/**
 * Resolves `PakisoModuleOptions.storage` (an instance or zero-argument
 * constructor) into a concrete adapter, wrapping it in `CodedStorageAdapter`
 * when an explicit `codec` is supplied, or when `PAKISO_ENCRYPTION_KEY` is
 * set in the environment (defaulting to AES-256-GCM).
 */
export function resolveStorageAdapter(options: PakisoModuleOptions): PakisoStorageAdapter {
  const base = instantiateStorage(options.storage);
  const codec = options.codec ?? createDefaultCodecFromEnv();
  return codec ? new CodedStorageAdapter(base, codec) : base;
}

function instantiateStorage(storage: PakisoModuleOptions['storage']): PakisoStorageAdapter {
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
