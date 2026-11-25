import { SetMetadata } from '@nestjs/common';
import { getCurrentPakisoContext } from '@pakiso/core';
import { PAKISO_WORKFLOW_METADATA } from './constants.js';
import type { WorkflowDecoratorOptions } from './types.js';

/**
 * Marks a provider method as a Pakiso workflow handler. `WorkflowExplorer`
 * discovers every `@Workflow()`-decorated method across all providers at
 * bootstrap and registers it with the `PakisoEngine` under `options.name`.
 * The decorated method must match the `WorkflowHandler` signature:
 * `(input, ctx) => Promise<output>`.
 */
export function Workflow(options: WorkflowDecoratorOptions): MethodDecorator {
  return SetMetadata(PAKISO_WORKFLOW_METADATA, options);
}

/**
 * Wraps a provider method so each invocation is automatically recorded as a
 * `ctx.step()` whenever it runs inside an active workflow (detected via the
 * ambient PakisoContext from `getCurrentPakisoContext()`). Outside of a
 * workflow run, the method behaves exactly as if undecorated.
 */
export function Recordable(): MethodDecorator {
  return (_target, propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value;
    if (typeof original !== 'function') {
      return descriptor;
    }

    descriptor.value = function pakisoRecordable(this: unknown, ...args: unknown[]) {
      const ctx = getCurrentPakisoContext();
      if (!ctx) {
        return original.apply(this, args);
      }
      return ctx.step(String(propertyKey), () => original.apply(this, args));
    };

    return descriptor;
  };
}
