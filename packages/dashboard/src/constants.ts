/**
 * Base path the dashboard (bundled UI + its read-only JSON API) is mounted
 * under. Fixed for now rather than configurable — see
 * CausalDashboardModule's docstring for why.
 *
 * Kept in sync by hand with `vite.config.ts`'s `base` option and
 * `frontend/src/api.ts`'s `API_BASE`, which can't share this constant
 * directly since they're compiled by a different toolchain (Vite) than the
 * NestJS backend (tsup/tsc).
 */
export const DASHBOARD_MOUNT_PATH = 'causal-dashboard';
