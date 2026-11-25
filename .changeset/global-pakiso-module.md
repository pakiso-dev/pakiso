---
"@causal/nest": patch
---

Mark `CausalModule.forRoot()`/`forRootAsync()` as a global NestJS module and export `CAUSAL_MODULE_OPTIONS`. Previously, any feature module other than the one importing `CausalModule` directly could not inject `CAUSAL_ENGINE`/`CAUSAL_STORAGE_ADAPTER`, and `RedactResponseInterceptor` (which depends on `CAUSAL_MODULE_OPTIONS`) could not be applied via `@UseInterceptors()` outside of `CausalModule` itself — exactly the documented usage pattern for both.
