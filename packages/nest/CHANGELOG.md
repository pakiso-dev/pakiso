# @pakiso/nest

## 1.0.0

### Patch Changes

- 4c9698d: Mark `PakisoModule.forRoot()`/`forRootAsync()` as a global NestJS module and export `PAKISO_MODULE_OPTIONS`. Previously, any feature module other than the one importing `PakisoModule` directly could not inject `PAKISO_ENGINE`/`PAKISO_STORAGE_ADAPTER`, and `RedactResponseInterceptor` (which depends on `PAKISO_MODULE_OPTIONS`) could not be applied via `@UseInterceptors()` outside of `PakisoModule` itself — exactly the documented usage pattern for both.
- Updated dependencies [b264d0d]
  - @pakiso/core@1.0.0
