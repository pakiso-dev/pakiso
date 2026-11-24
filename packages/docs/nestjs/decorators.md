# Decorators

`@causal/nest` provides two **method** decorators — neither decorates a
class.

#### `@Workflow(options)`

```ts
function Workflow(options: WorkflowDecoratorOptions): MethodDecorator;

interface WorkflowDecoratorOptions {
  name: string;
  redactFields?: string[];
}
```

Marks a provider method as a workflow entry point, registered with the
engine under `options.name` at bootstrap (see
[Discovery service](/nestjs/discovery-service)). The method must have the
same shape as any other workflow handler: `(input, ctx) => Promise<output>`.

```ts
@Injectable()
export class OrderWorkflow {
  @Workflow({ name: 'order-fulfillment' })
  async fulfill(input: { orderId: string }, ctx: CausalContext) {
    return { orderId: input.orderId, fulfilled: true };
  }
}
```

#### `@Recordable()`

```ts
function Recordable(): MethodDecorator;
```

Wraps a method so that, when called **from within an active workflow**, the
call is automatically recorded as a `ctx.step()` under the method's own
name — making an existing service method replay-safe without changing its
call sites or threading `ctx` through manually. Outside of an active
workflow context, it just calls the original method directly.

```ts
@Injectable()
export class PaymentsService {
  @Recordable()
  async chargeCard(orderId: string) {
    return callPaymentProvider(orderId);
  }
}
```

#### Combining them

A workflow method can call a separate recordable service method — the
decorator reads the currently-active `CausalContext` via
`AsyncLocalStorage` under the hood, so it works across the call even though
`ctx` was never passed in explicitly:

```ts
@Injectable()
export class PaymentsService {
  @Recordable()
  async chargeCard(orderId: string) {
    return { orderId, charged: true };
  }
}

@Injectable()
export class OrderWorkflow {
  constructor(private readonly payments: PaymentsService) {}

  @Workflow({ name: 'order-fulfillment' })
  async fulfill(input: { orderId: string }) {
    // Recorded as step "chargeCard" — no ctx.step() call needed here.
    return this.payments.chargeCard(input.orderId);
  }
}
```

Use `@Recordable()` when a step is a plain reusable service method; use
`ctx.step(stepName, fn)` directly (see [Causal context](/overview/causal-context))
when you need an explicit step name that differs from the method name, or
the call site isn't itself a provider method — the
[onboarding recipe](/recipes/onboarding-walkthrough) uses both styles side
by side.
