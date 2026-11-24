# CausalModule

`CausalModule` wires a BYOS `CausalStorageAdapter` and a `CausalEngine` into
Nest's DI container, connects/disconnects the storage adapter on module
init/destroy, and discovers `@Workflow()`-decorated methods at bootstrap
(see [Discovery service](/nestjs/discovery-service)).

#### `forRoot(options)`

```ts
import { InMemoryStorageAdapter } from '@causal/core';
import { CausalModule } from '@causal/nest';

@Module({
  imports: [CausalModule.forRoot({ storage: new InMemoryStorageAdapter() })],
})
export class AppModule {}
```

```ts
interface CausalModuleOptions {
  /** Any BYOS CausalStorageAdapter instance or zero-argument class constructor */
  storage: CausalStorageAdapter | (new (...args: any[]) => CausalStorageAdapter);
  /** Optional PayloadCodec for at-rest encryption (defaults to AES-256-GCM if CAUSAL_ENCRYPTION_KEY is set) */
  codec?: PayloadCodec;
  /** Default sensitive field names masked in HTTP inspection helpers */
  redactFields?: string[];
}
```

`storage` accepts either an instance or a zero-argument constructor — the
module will instantiate it for you:

```ts
CausalModule.forRoot({ storage: InMemoryStorageAdapter });
```

#### `forRootAsync(options)`

For when the storage adapter depends on other providers (e.g. a config
service or a dynamically-resolved database URL):

```ts
interface CausalModuleAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (...args: any[]) => Promise<CausalModuleOptions> | CausalModuleOptions;
}
```

```ts
CausalModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    storage: new PrismaStorageAdapter(config.get('prisma')),
    redactFields: ['dateOfBirth'],
  }),
});
```

The factory may return options directly or a `Promise`.

#### What gets registered

Both `forRoot` and `forRootAsync` register four providers and mark the
module **global**, so any feature module can inject these tokens without
re-importing `CausalModule` (which would otherwise instantiate a second,
independent storage adapter):

| Token | Resolves to |
| --- | --- |
| `CAUSAL_MODULE_OPTIONS` | The resolved `CausalModuleOptions` |
| `CAUSAL_STORAGE_ADAPTER` | The resolved `CausalStorageAdapter` (see [encryption](#encryption) below) |
| `CAUSAL_ENGINE` | An `InProcessCausalEngine` constructed with that adapter |

`WorkflowExplorer` is also provided (for the `@Workflow()` discovery pass at
bootstrap) but is not exported — you don't inject it yourself.

```ts
@Injectable()
class RunsService {
  constructor(
    @Inject(CAUSAL_ENGINE) private readonly engine: CausalEngine,
    @Inject(CAUSAL_STORAGE_ADAPTER) private readonly storage: CausalStorageAdapter,
  ) {}
}
```

#### Lifecycle

On Nest's `onModuleInit`, `CausalModule` calls `storage.connect?.()`; on
`onModuleDestroy`, it calls `storage.disconnect?.()`. Both are no-ops for
adapters that don't implement them (like `InMemoryStorageAdapter`).

#### Encryption

If you don't pass an explicit `codec` option, `CausalModule` checks the
`CAUSAL_ENCRYPTION_KEY` environment variable at startup. If it's set, the
resolved storage adapter is automatically wrapped in a
`CodedStorageAdapter` using `Aes256GcmPayloadCodec`, with the key ID taken
from `CAUSAL_ENCRYPTION_KEY_ID` (defaulting to `'default'`):

```bash
CAUSAL_ENCRYPTION_KEY="<base64 32-byte key>"
CAUSAL_ENCRYPTION_KEY_ID="2024-01"   # optional, defaults to "default"
```

See [Encryption](/fundamentals/encryption) for the codec contract and key
rotation.

#### Next

- [Decorators](/nestjs/decorators) — `@Workflow()` and `@Recordable()`.
- [Discovery service](/nestjs/discovery-service) — how workflows get registered at bootstrap.
- [REST control plane](/nestjs/rest-control-plane) — exposing start/signal/inspect over HTTP.
