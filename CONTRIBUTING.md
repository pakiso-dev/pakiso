# Contributing to Pakiso

Thanks for your interest in contributing! This guide covers how the repo is organized,
how to propose changes, and how releases get published.

## Getting started

```bash
corepack enable
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

This is a [pnpm workspace](./pnpm-workspace.yaml) orchestrated with [Turborepo](./turbo.json).
Packages live under [packages/](./packages) (see the table in [README.md](./README.md) for
what each one does). Each package builds with `tsup`, is tested with Vitest, and is linted/
formatted with [Biome](./biome.json) (`pnpm lint`, `pnpm format`).

## Branching

- `main` is the only long-lived branch — this project uses trunk-based development.
  There are no `develop`/`release` branches; every change is a short-lived branch off
  `main` that merges back into `main`.
- Name branches `<type>/<short-description>`, e.g. `feat/replay-cli-flags`,
  `fix/dashboard-auth-redirect`, `docs/contributing-guide`. Use the same `<type>` prefixes
  as commit messages (see below).
- `changeset-release/main` is a special branch maintained automatically by the release
  bot (see [Releases & deployment](#releases--deployment)) — don't push to it manually.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) style:
`type: short description` (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `refactor:`, `test:`).
This isn't enforced by tooling, but keep history consistent with existing commits.

## Pull requests

All changes land on `main` via pull request. `main` is a protected branch:

- **CI must pass**: both `build-test-lint (20)` and `build-test-lint (22)` jobs from
  [ci.yml](./.github/workflows/ci.yml) (lint, typecheck, build, test on Node 20 and 22)
  must succeed, and the PR branch must be up to date with `main` before merging.
- **Merge method**: this repo only allows **squash merging** — a PR becomes a single
  commit on `main`, and the source branch is deleted automatically after merge.
- No required review count is enforced (solo/small-maintainer project), but please still
  open a PR rather than pushing directly to `main` so CI runs before the change lands.

Before opening a PR:

1. Run `pnpm lint && pnpm typecheck && pnpm build && pnpm test` locally.
2. If your change affects a published package's behavior (any package under
   `packages/*` except `@pakiso/docs` and `@pakiso/example-api`, which are `private`),
   add a changeset (see below) — CI doesn't require one, but releases won't pick up
   your change without it.

## Changesets

Releases and version numbers are managed with [Changesets](https://github.com/changesets/changesets).
If your PR changes the published behavior of a package, add a changeset:

```bash
pnpm changeset
```

This prompts you to pick affected packages, a bump type (patch/minor/major), and write a
short summary — it writes a Markdown file under [.changeset/](./.changeset) that you
commit as part of your PR. See [.changeset/add-mit-license.md](./.changeset/add-mit-license.md)
(if still present) for an example of the format.

All packages are versioned together as a **fixed group** (see `fixed` in
[.changeset/config.json](./.changeset/config.json)): a changeset touching any one package
bumps every package in the workspace to the same version number, so they stay in sync.

## Continuous integration

[ci.yml](./.github/workflows/ci.yml) runs on every push to `main` and every pull request
targeting `main`, on a Node 20/22 matrix: install → lint (Node 22 only) → typecheck →
build → test.

## Releases & deployment

Publishing to npm is fully automated via [release.yml](./.github/workflows/release.yml)
and `changesets/action`, triggered on every push to `main`:

1. **Version PR**: if there are unconsumed changesets on `main`, the workflow opens or
   updates a `chore: version packages` pull request from the `changeset-release/main`
   branch. This PR consumes the changesets, bumps every package's version (fixed group),
   and updates each package's `CHANGELOG.md`.
2. **Publish**: merging that PR back into `main` re-triggers the workflow. This time there
   are no pending changesets, so instead of opening a PR it runs `pnpm release`
   (`turbo run build && changeset publish`), which publishes every non-private, changed
   package to npm (using the `NPM_TOKEN` secret) and pushes a git tag per package
   (e.g. `@pakiso/core@1.0.3`).

A few things worth knowing:

- The checkout step uses a `GH_PAT` secret instead of the default `GITHUB_TOKEN` —
  commits authored by the default token don't trigger other workflow runs (to prevent
  infinite loops), so without a PAT, merging the version PR would never re-trigger this
  workflow to actually publish.
- `@pakiso/docs` and `@pakiso/example-api` are `private: true` and are versioned/changelogged
  alongside the rest of the fixed group but are never published to npm.
- You generally shouldn't need to run `pnpm release` or `npm publish` locally — merging the
  version PR is the supported way to cut a release. (It also requires npm publish
  credentials that aren't available outside CI.)

### Docs site deployment

The public documentation site ([packages/docs](./packages/docs), a VitePress app) deploys
to GitHub Pages via [pages.yml](./.github/workflows/pages.yml), triggered on pushes to
`main` that touch `packages/docs/**` or the workflow file itself. It can also be run
manually via `workflow_dispatch`.

## License

By contributing, you agree that your contributions will be licensed under the project's
[MIT License](./LICENSE).
