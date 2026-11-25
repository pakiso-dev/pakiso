# @pakiso/nest

NestJS integration for Pakiso — `PakisoModule`, decorators, workflow
discovery, and REST control-plane helpers on top of
[`@pakiso/core`](../core).

## Install

```bash
pnpm add @pakiso/nest @pakiso/core
```

## `PakisoModule`

Wires a BYOS `PakisoStorageAdapter` and a `PakisoEngine` into Nest's DI
container, connects/disconnects the storage adapter on module init/destroy,
and discovers `@Workflow()`-decorated methods at bootstrap:

```ts
import { Module } from '@nestjs/common';
import { InMemoryStorageAdapter } from '@pakiso/core';
import { PakisoModule } from '@pakiso/nest';

@Module({
  imports: [PakisoModule.forRoot({ storage: new InMemoryStorageAdapter() })],
})
export class AppModule {}
```

`PakisoModule.forRootAsync()` is also available for when the storage adapter
depends on other providers (e.g. a config service):

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

Both register four global providers — `PAKISO_ENGINE`, `PAKISO_STORAGE_ADAPTER`,
and two internal tokens — so any feature module can `@Inject()` them without
re-importing `PakisoModule`.

## Decorators

### `@Workflow(options)`

Marks a provider method as a workflow entry point, registered with the engine
under `options.name` at bootstrap. The method must have the same shape as any
other workflow handler: `(input, ctx) => Promise<output>`.

```ts
@Injectable()
export class OrderWorkflow {
  @Workflow({ name: 'order-fulfillment' })
  async fulfill(input: { orderId: string }, ctx: PakisoContext) {
    return { orderId: input.orderId, fulfilled: true };
  }
}
```

### `@Recordable()`

Wraps a method so that, when called **from within an active workflow**, the
call is automatically recorded as a `ctx.step()` under the method's own name
— making an existing service method replay-safe without threading `ctx`
through manually. Outside of an active workflow context, it just calls the
original method directly.

```ts
@Injectable()
export class PaymentsService {
  @Recordable()
  async chargeCard(orderId: string) {
    return callPaymentProvider(orderId);
  }
}
```

## REST control plane

`@pakiso/nest` does **not** ship controllers or routes — starting runs,
signaling gates, and inspecting run status over HTTP is left to your
application, built on top of the injected `PAKISO_ENGINE` token:

```ts
import { PAKISO_ENGINE, readIdempotencyKey } from '@pakiso/nest';
import type { PakisoEngine } from '@pakiso/core';

@Controller('onboarding')
export class OnboardingController {
  constructor(@Inject(PAKISO_ENGINE) private readonly engine: PakisoEngine) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async start(@Body() dto: CreateOnboardingDto) {
    const run = await this.engine.startWorkflow({
      workflowName: 'user-onboarding',
      input: dto,
      correlationKey: `onboarding:${dto.email}`,
    });
    return { runId: run.id, status: run.status };
  }

  @Post(':runId/email-verified')
  async verifyEmail(@Param('runId') runId: string) {
    await this.engine.signalByRunId(runId, {
      gateName: 'email-verified',
      payload: { verifiedAt: new Date().toISOString() },
    });
  }
}
```

`readIdempotencyKey(headers)` reads a client-supplied idempotency key from
request headers, for combining with `correlationKey` on `startWorkflow`. See
the [example app](../example-api) for a complete onboarding flow built on
this pattern.

## Documentation

Full docs — including the discovery service internals, response redaction,
and the embeddable [`@pakiso/dashboard`](../dashboard) — live at
[pakiso-dev.github.io/pakiso](https://pakiso-dev.github.io/pakiso/).
