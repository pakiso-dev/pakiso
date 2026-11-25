# Pakiso

A stateful, deterministic, auditable execution framework for Node.js and NestJS with
Bring-Your-Own-Storage (BYOS), human/policy attestation gates, and local trace replay.

See [docs/pakiso_implementation_plan.md](./docs/pakiso_implementation_plan.md) for the
full architecture, contracts, and phased roadmap.

## Packages

| Package                                          | Description                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| [`@pakiso/core`](./packages/core)                 | Zero-dependency deterministic execution engine (BYOS, replay, encryption) |
| [`@pakiso/nest`](./packages/nest)                 | NestJS module, decorators, discovery, REST control-plane helpers |
| [`@pakiso/storage-prisma`](./packages/storage-prisma) | Multi-dialect Prisma storage adapter (Postgres/MySQL/SQLite)      |
| [`@pakiso/cli`](./packages/cli)                   | Developer CLI (`pakiso init` / `pakiso inspect` / `pakiso replay`) |
| [`@pakiso/dashboard`](./packages/dashboard)       | Embeddable NestJS dashboard: browse runs and view their full event journals from your live app |
| [`@pakiso/example-api`](./packages/example-api)   | Example NestJS app: a durable user-onboarding workflow with email/compliance attestation gates |
| [`@pakiso/docs`](./packages/docs)                 | Public developer documentation site (VitePress) |

## Development

```bash
corepack enable
pnpm install
pnpm build
pnpm test
pnpm lint
```

This is a pnpm workspace orchestrated with Turborepo. Each package builds with
`tsup` (dual ESM/CJS + type declarations) and is tested with Vitest. Linting and
formatting are handled by Biome. Releases are managed with Changesets.

## Documentation

```bash
pnpm docs:dev    # serve the docs site locally
pnpm docs:build  # build the static site into packages/docs/dist
```

See [packages/docs](./packages/docs) for the source.
