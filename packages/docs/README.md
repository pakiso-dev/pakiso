# @pakiso/docs

Public developer documentation site for Pakiso, built with
[VitePress](https://vitepress.dev).

Content lives as plain Markdown under this directory (`introduction.md`,
`overview/`, `fundamentals/`, `nestjs/`, `storage/`, `cli/`, `recipes/`,
`faq.md`), organized the same way as `docs.nestjs.com`: content is decoupled
from the site shell, and a single ordered tree — the `sidebar` array in
[`.vitepress/config.ts`](./.vitepress/config.ts) — drives both the sidebar
navigation and the prev/next pager on every page.

## Development

```bash
pnpm --filter @pakiso/docs dev      # serve locally with hot reload
pnpm --filter @pakiso/docs build    # build the static site into dist/
pnpm --filter @pakiso/docs preview  # preview the built site
```

Or, from the repo root:

```bash
pnpm docs:dev
pnpm docs:build
```

## Adding a page

1. Add a Markdown file under the relevant directory.
2. Add an entry to the `sidebar` array in `.vitepress/config.ts` — this is
   the single source of truth for both navigation and reading order.
