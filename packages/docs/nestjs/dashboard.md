# Dashboard

`@causal/dashboard` is an embeddable NestJS module that mounts a read-only,
**server-rendered React** dashboard — plus the JSON API behind it — for
browsing Causal runs and their full event journals straight from your live
app, no DB/VPN access or hand-rolled REST controller required.

```bash
pnpm add @causal/dashboard
```

```ts
import { CausalDashboardModule } from '@causal/dashboard';
import { CausalModule } from '@causal/nest';

@Module({
  imports: [
    CausalModule.forRoot({ storage /* ... */ }),
    CausalDashboardModule,
  ],
})
export class AppModule {}
```

Visit `/causal-dashboard` on your running app to browse runs (filterable by
workflow name/status, paginated) and drill into a run's full event
journal — the same `seq` / `type` / `step-gate` / `durationMs` / `createdAt`
columns [`causal inspect`](/cli/overview#causal-inspect-runid) prints, in a
browser instead of a terminal. Every response is server-rendered with real
data already embedded in the HTML — verify it yourself with `curl`, no
JavaScript required — then hydrated by React for fast client-side
navigation between the list and detail views afterwards.

#### It reuses your app's own storage adapter

`CausalDashboardModule` doesn't configure its own `CausalStorageAdapter` or
open a second database connection — it injects the same
`CAUSAL_STORAGE_ADAPTER` provider your `CausalModule.forRoot()`/
`forRootAsync()` already registered, so it always reflects exactly what the
live app's engine is operating on. This means `CausalModule` must already be
imported somewhere in the app before `CausalDashboardModule`.

#### `listRuns` is required for run browsing

Unlike `getRun`/`getLatestRunByCorrelationKey`, browsing a list of runs
without already knowing their id requires the storage adapter to implement
the optional `listRuns()` method (see the
[storage adapters overview](/overview/storage-adapters)).
`InMemoryStorageAdapter` and `PrismaStorageAdapter` both implement it out of
the box; a [custom BYOS adapter](/fundamentals/custom-storage-adapters) that
doesn't will render an in-page message on the list page instead (the
separate JSON API still returns a clear `501 Not Implemented` from
`GET /causal-dashboard/api/runs` for programmatic callers —
`causal-dashboard/api/runs/:id`/`causal-dashboard/runs/:id` — single-run
lookup by id — still work regardless, since they only need
`getRun`/`getEvents`).

#### Scope: view-only

This dashboard only browses runs and inspects journals — it does not expose
any way to signal gates, retry, or cancel runs from the UI. For that, build
your own endpoints on top of `engine.signalByRunId`/`signalByCorrelationKey`
as described in the [REST control plane](/nestjs/rest-control-plane) page.

#### Auth is still your concern

Consistent with Causal's existing stance that deciding who may inspect or
signal a run is the host application's responsibility, this module applies
no authentication/authorization of its own. Guard the `causal-dashboard`
prefix before exposing it outside your own team — a global guard scoped to
that path, a reverse-proxy rule, or simply not exposing the port publicly
are all reasonable options.

#### How the UI is served

Each page load is server-rendered: `DashboardPagesController` calls
`renderToString` on an isomorphic React tree directly against the storage
adapter (no self-HTTP round-trip), wraps the markup in a full HTML document,
and embeds the same page data as JSON for the client bundle to hydrate
against — no redundant re-fetch on first load. Links and the filter form are
plain `<a>`/`<form method="get">`, so the dashboard works with JavaScript
disabled; after hydration, clicking them is intercepted for fast client-side
navigation via the separate JSON API instead of a full page reload.

The client hydration bundle + stylesheet are served via Nest's
`StreamableFile` rather than `@nestjs/serve-static`/Express-specific static
middleware, so the dashboard works the same whether your app runs on Nest's
Express or Fastify HTTP adapter. Styling is [Tailwind CSS v4](https://tailwindcss.com)
compiled at build time via `@tailwindcss/vite`. React/ReactDOM are regular
dependencies of `@causal/dashboard` itself (not peer dependencies) — purely
an implementation detail of the bundled UI; your host app doesn't need
React (or Tailwind) installed.
