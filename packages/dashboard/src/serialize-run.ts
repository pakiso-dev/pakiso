import type { CausalEventRecord, CausalRunRecord } from '@causal/core';
import type { WireCausalEventRecord, WireCausalRunRecord } from './wire-types.js';

export function toWireRun(run: CausalRunRecord): WireCausalRunRecord {
  return {
    ...run,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    attestationExpiresAt: run.attestationExpiresAt ? run.attestationExpiresAt.toISOString() : null,
  };
}

export function toWireEvent(event: CausalEventRecord): WireCausalEventRecord {
  return { ...event, createdAt: event.createdAt.toISOString() };
}
