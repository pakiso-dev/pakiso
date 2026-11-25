# PakisoModule

`PakisoModule` wires a BYOS `PakisoStorageAdapter` and a `PakisoEngine` into
Nest's DI container, connects/disconnects the storage adapter on module
init/destroy, and discovers `@Workflow()`-decorated methods at bootstrap
(see [Discovery service](/nestjs/discovery-service)).

#### `forRoot(options)`

```ts
import { InMemoryStorageAdapter } from '@pakiso/core';
import { PakisoModule } from '@pakiso/nest';

@Module({
  imports: [PakisoModule.forRoot({ storage: new InMemoryStorageAdapter() })],
})
export class AppModule {}
```

```ts
interface PakisoModuleOptions {
  /** Any BYOS PakisoStorageAdapter instance or zero-argument class constructor */
  storage: PakisoStorageAdapter | (new (...args: any[]) => PakisoStorageAdapter);
  /** Optional PayloadCodec for at-rest encryption (defaults to AES-256-GCM if PAKISO_ENCRYPTION_KEY is set) */
  codec?: PayloadCodec;
  /** Default sensitive field names masked in HTTP inspection helpers */
  redactFields?: string[];
}
```

`storage` accepts either an instance or a zero-argument constructor — the
module will instantiate it for you:

```ts
PakisoModule.forRoot({ storage: InMemoryStorageAdapter });
```

#### `forRootAsync(options)`

For when the storage adapter depends on other providers (e.g. a config
service or a dynamically-resolved database URL):

```ts
interface PakisoModuleAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (...args: any[]) => Promise<PakisoModuleOptions> | PakisoModuleOptions;
}
```

```ts
PakisoModule.forRootAsync({
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
re-importing `PakisoModule` (which would otherwise instantiate a second,
independent storage adapter):

| Token | Resolves to |
| --- | --- |
| `PAKISO_MODULE_OPTIONS` | The resolved `PakisoModuleOptions` |
| `PAKISO_STORAGE_ADAPTER` | The resolved `PakisoStorageAdapter` (see [encryption](#encryption) below) |
| `PAKISO_ENGINE` | An `InProcessPakisoEngine` constructed with that adapter |

`WorkflowExplorer` is also provided (for the `@Workflow()` discovery pass at
bootstrap) but is not exported — you don't inject it yourself.

```ts
@Injectable()
class RunsService {
  constructor(
    @Inject(PAKISO_ENGINE) private readonly engine: PakisoEngine,
    @Inject(PAKISO_STORAGE_ADAPTER) private readonly storage: PakisoStorageAdapter,
  ) {}
}
```

#### Lifecycle

On Nest's `onModuleInit`, `PakisoModule` calls `storage.connect?.()`; on
`onModuleDestroy`, it calls `storage.disconnect?.()`. Both are no-ops for
adapters that don't implement them (like `InMemoryStorageAdapter`).

#### Encryption

If you don't pass an explicit `codec` option, `PakisoModule` checks the
`PAKISO_ENCRYPTION_KEY` environment variable at startup. If it's set, the
resolved storage adapter is automatically wrapped in a
`CodedStorageAdapter` using `Aes256GcmPayloadCodec`, with the key ID taken
from `PAKISO_ENCRYPTION_KEY_ID` (defaulting to `'default'`):

```bash
PAKISO_ENCRYPTION_KEY="<base64 32-byte key>"
PAKISO_ENCRYPTION_KEY_ID="2024-01"   # optional, defaults to "default"
```

See [Encryption](/fundamentals/encryption) for the codec contract and key
rotation.

#### Next

- [Decorators](/nestjs/decorators) — `@Workflow()` and `@Recordable()`.
- [Discovery service](/nestjs/discovery-service) — how workflows get registered at bootstrap.
- [REST control plane](/nestjs/rest-control-plane) — exposing start/signal/inspect over HTTP.
