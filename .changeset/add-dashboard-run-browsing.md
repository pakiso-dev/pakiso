---
"@causal/core": minor
"@causal/storage-prisma": minor
"@causal/dashboard": minor
---

Add an optional `listRuns()` method to `CausalStorageAdapter` for browsing/paginating runs by `workflowName`/`status` without already knowing a run's id or correlation key, implemented in `InMemoryStorageAdapter` and `PrismaStorageAdapter`. Introduce `@causal/dashboard`, a new embeddable NestJS module (`CausalDashboardModule`) that mounts a read-only, server-rendered React dashboard (styled with Tailwind CSS) — plus the JSON API behind it — for browsing runs and viewing their full event journals from a live app, reusing the host app's own `CAUSAL_STORAGE_ADAPTER` provider. Every page is rendered with real data on the server (works without JavaScript) and hydrated with React for fast client-side navigation afterwards.
