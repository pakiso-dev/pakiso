# @pakiso/nest

## 1.0.2

### Patch Changes

- 4d0e4d3: Fix docs links pointing to the unregistered `pakiso.dev` domain — the actual docs site is hosted at https://pakiso-dev.github.io/pakiso/ (GitHub Pages project site, see `packages/docs/.vitepress/config.ts`).
- Updated dependencies [4d0e4d3]
  - @pakiso/core@1.0.2

## 1.0.1

### Patch Changes

- 2d2cbf1: Add missing `README.md` files for `@pakiso/core` and `@pakiso/nest` — both previously had no README at all, so npm showed "This package does not have a README" on their package pages.
- Updated dependencies [2d2cbf1]
  - @pakiso/core@1.0.1

## 1.0.0

### Patch Changes

- 4c9698d: Mark `PakisoModule.forRoot()`/`forRootAsync()` as a global NestJS module and export `PAKISO_MODULE_OPTIONS`. Previously, any feature module other than the one importing `PakisoModule` directly could not inject `PAKISO_ENGINE`/`PAKISO_STORAGE_ADAPTER`, and `RedactResponseInterceptor` (which depends on `PAKISO_MODULE_OPTIONS`) could not be applied via `@UseInterceptors()` outside of `PakisoModule` itself — exactly the documented usage pattern for both.
- Updated dependencies [b264d0d]
  - @pakiso/core@1.0.0
