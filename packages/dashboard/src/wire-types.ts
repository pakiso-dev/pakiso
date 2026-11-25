/**
 * JSON-safe ("wire") shapes mirroring `@pakiso/core`'s `PakisoRunRecord`/
 * `PakisoEventRecord` (with `Date` fields serialized to ISO strings), plus
 * the discriminated union describing what the dashboard's SSR renderer
 * draws for a given request. Defined once here (not duplicated in
 * `frontend/`) and re-exported through `frontend/src/types.ts` — Vite's
 * bundler happily resolves across the `src/`/`frontend/` boundary for a
 * type-only module like this (erased entirely at build time), even though
 * tsup's `rootDir: "src"` means only this backend half of the package ever
 * emits JS from it.
 */

export type PakisoRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'WAITING_ATTESTATION'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface WirePakisoRunRecord {
  id: string;
  workflowName: string;
  correlationKey: string | null;
  idempotencyKey: string | null;
  status: PakisoRunStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  attestationExpiresAt: string | null;
}

export interface WirePakisoEventRecord {
  id: string;
  runId: string;
  seq: number;
  type: string;
  stepName: string | null;
  durationMs: number | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ListRunsFilter {
  workflowName?: string;
  status?: PakisoRunStatus;
}

export type PageData =
  | {
      type: 'list';
      runs: WirePakisoRunRecord[];
      nextCursor: string | null;
      filter: ListRunsFilter;
      /** Set when the configured PakisoStorageAdapter doesn't implement `listRuns()`. */
      unsupported?: boolean;
    }
  | { type: 'detail'; run: WirePakisoRunRecord; events: WirePakisoEventRecord[] }
  | { type: 'not-found'; runId: string };
