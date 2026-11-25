/**
 * Re-exports the backend's JSON-safe wire types. This is the one place in
 * `frontend/` that reaches across into `../src/` (see `wire-types.ts` for
 * why) — every other frontend module imports from this local file instead.
 */
export type {
  PakisoRunStatus,
  WirePakisoRunRecord as PakisoRunRecord,
  WirePakisoEventRecord as PakisoEventRecord,
  ListRunsFilter,
  PageData,
} from '../../src/wire-types.js';
