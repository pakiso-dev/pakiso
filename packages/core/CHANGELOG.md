# @pakiso/core

## 1.0.1

### Patch Changes

- 2d2cbf1: Add missing `README.md` files for `@pakiso/core` and `@pakiso/nest` — both previously had no README at all, so npm showed "This package does not have a README" on their package pages.

## 1.0.0

### Minor Changes

- b264d0d: Add an optional `listRuns()` method to `PakisoStorageAdapter` for browsing/paginating runs by `workflowName`/`status` without already knowing a run's id or correlation key, implemented in `InMemoryStorageAdapter` and `PrismaStorageAdapter`. Introduce `@pakiso/dashboard`, a new embeddable NestJS module (`PakisoDashboardModule`) that mounts a read-only, server-rendered React dashboard (styled with Tailwind CSS) — plus the JSON API behind it — for browsing runs and viewing their full event journals from a live app, reusing the host app's own `PAKISO_STORAGE_ADAPTER` provider. Every page is rendered with real data on the server (works without JavaScript) and hydrated with React for fast client-side navigation afterwards.
