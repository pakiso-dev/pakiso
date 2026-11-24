# Redaction

Workflow run inputs/outputs and event payloads often contain sensitive
fields (passwords, tokens, dates of birth, ...) that shouldn't be echoed back
verbatim over HTTP. `@causal/nest` provides a redaction helper and a
ready-made response interceptor for this.

#### `redactSensitiveFields`

```ts
function redactSensitiveFields(
  value: Record<string, unknown>,
  options?: RedactionOptions,
): Record<string, unknown>;

interface RedactionOptions {
  extraKeys?: string[];
}
```

Recursively deep-clones `value`, replacing any object key whose name
case-insensitively matches a known sensitive field — at **any nesting
depth**, including objects nested inside arrays — with the literal string
`'[REDACTED]'`. Circular references are replaced with `'[CIRCULAR]'`.

Built-in sensitive key names: `password`, `secret`, `token`, `apikey`,
`api_key`, `authorization`, `ssn`, `creditcard`, `credit_card`,
`cardnumber`, `card_number`, `cvv`, `pin`. Add your own via
`options.extraKeys`.

```ts
redactSensitiveFields({ user: { email: 'a@b.com', password: 'hunter2' } });
// => { user: { email: 'a@b.com', password: '[REDACTED]' } }

redactSensitiveFields({ dateOfBirth: '1990-01-01' }, { extraKeys: ['dateOfBirth'] });
// => { dateOfBirth: '[REDACTED]' }
```

::: tip Why hand-rolled recursion instead of a path-compiling library?
Path-compiling redaction libraries compile object paths into executable
code — and their own documentation warns against deriving paths from
untrusted/dynamic data, which is exactly what workflow run inputs/outputs
are. Matching by key name via plain recursion has no such risk and handles
arbitrary depth/shape safely.
:::

#### `RedactResponseInterceptor`

A ready-made NestJS interceptor that applies `redactSensitiveFields` to
every controller response, using the module-level `redactFields` option
(see [CausalModule](/nestjs/module)) as `extraKeys`:

```ts
import { RedactResponseInterceptor } from '@causal/nest';

@UseInterceptors(RedactResponseInterceptor)
@Controller('onboarding')
export class OnboardingController {
  @Get(':runId')
  getRun() {
    return this.storage.getRun(/* ... */); // redacted automatically
  }
}
```

The interceptor depends on `CAUSAL_MODULE_OPTIONS` through Nest's DI, so it
must be used in an app where `CausalModule` is registered. It leaves `null`,
primitives, and arrays untouched at the top level; only non-null,
non-array response objects are passed through `redactSensitiveFields`.

Configure the extra field names at the module level:

```ts
CausalModule.forRoot({
  storage: new InMemoryStorageAdapter(),
  redactFields: ['dateOfBirth'],
});
```
