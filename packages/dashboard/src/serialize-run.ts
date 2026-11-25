import type { PakisoEventRecord, PakisoRunRecord } from '@pakiso/core';
import type { WirePakisoEventRecord, WirePakisoRunRecord } from './wire-types.js';

export function toWireRun(run: PakisoRunRecord): WirePakisoRunRecord {
  return {
    ...run,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    attestationExpiresAt: run.attestationExpiresAt ? run.attestationExpiresAt.toISOString() : null,
  };
}

export function toWireEvent(event: PakisoEventRecord): WirePakisoEventRecord {
  return { ...event, createdAt: event.createdAt.toISOString() };
}
