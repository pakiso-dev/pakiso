# @causal/dashboard

An embeddable NestJS module that mounts a read-only, **server-rendered React**
dashboard — plus the JSON API behind it — for browsing Causal runs and their
full event journals, straight from your live app.

```bash
pnpm add @causal/dashboard
```

```ts
import { CausalModule } from '@causal/nest';
import { CausalDashboardModule } from '@causal/dashboard';

@Module({
  imports: [
    CausalModule.forRoot({ storage /* ... */ }),
    CausalDashboardModule,
  ],
})
export class AppModule {}
```

Visit `http://your-app/causal-dashboard` to browse runs (filterable by
workflow name/status) and drill into a run's full event journal — the same
`seq`/`type`/`step-gate`/`durationMs`/`createdAt` columns `causal inspect`
prints, in a browser. Every page load is server-rendered with real data
(verifiable with `curl` — no JavaScript required), then hydrated by React for
fast client-side navigation between the list and detail views afterwards.

## Requirements

- `CausalModule.forRoot()`/`forRootAsync()` must already be registered
  elsewhere in the app — this module reuses its global
  `CAUSAL_STORAGE_ADAPTER` provider rather than configuring its own, so the
  dashboard always reflects exactly what the live app's engine is operating
  on.
- Your `CausalStorageAdapter` must implement the optional `listRuns()`
  method for the run-browsing list to work (see
  [`@causal/core`'s storage contract](../core/src/storage.ts)).
  `InMemoryStorageAdapter` and `PrismaStorageAdapter` both implement it; a
  custom BYOS adapter that doesn't will render an in-page message instead
  (the separate JSON API still returns a `501 Not Implemented` for
  programmatic callers).

## Scope

This is a **view-only** dashboard: browsing runs and inspecting journals.
It does not expose any way to signal gates, retry, or cancel runs from the
UI. Like the rest of Causal, it applies no authentication/authorization of
its own — who may view run data is your application's concern; guard the
`causal-dashboard` prefix with your own mechanism (a global guard, a
reverse-proxy rule, etc.) before exposing it outside your team.

## Architecture

- **`DashboardPagesController`** — server-renders the two HTML pages (run
  list, run detail) directly from the storage adapter via React's
  `renderToString`, so the very first response already contains real data.
  Links/forms are plain `<a>`/`<form method="get">`, so the dashboard works
  with JavaScript disabled.
- **`DashboardRunsController`** — a separate read-only JSON API
  (`GET /causal-dashboard/api/runs[/:id]`) used by the client bundle for
  fast in-page navigation after hydration, and available for any other
  programmatic consumer.
- **`DashboardAssetsController`** — serves the client hydration bundle +
  stylesheet (built by `vite build`) via `StreamableFile` rather than
  `@nestjs/serve-static`/Express-specific middleware, so it works on both
  Nest's Express and Fastify adapters.
- Styling is [Tailwind CSS v4](https://tailwindcss.com) via `@tailwindcss/vite`
  — utility classes directly on components, no `tailwind.config.js`/content
  globs to maintain (the Vite plugin scans the build's module graph itself).
- React/ReactDOM are regular (non-peer) dependencies of this package —
  purely an implementation detail of how the bundled UI is rendered, like
  Vue is for `@causal/docs`'s VitePress. Your host app doesn't need React
  installed itself.

## Development

```bash
pnpm build:ui   # vite build (client bundle -> dist/public) + vite build --config vite.ssr.config.ts (SSR render fn -> dist/ssr)
pnpm build      # tsup (backend) + build:ui
pnpm test       # vitest (rebuilds the UI first via the `pretest` hook)
```

`frontend/src/App.tsx` is the single isomorphic React tree rendered both by
`entry-server.tsx` (`renderToString`, for SSR) and `entry-client.tsx`
(`hydrateRoot`, for hydration + subsequent client-side navigation) — see the
module docstrings for how the two halves stay in sync.
