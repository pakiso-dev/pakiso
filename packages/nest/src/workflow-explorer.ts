import type { CausalEngine, WorkflowHandler } from '@causal/core';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { CAUSAL_ENGINE, CAUSAL_WORKFLOW_METADATA } from './constants.js';
import type { WorkflowDecoratorOptions } from './types.js';

/**
 * Scans every provider at bootstrap for `@Workflow()`-decorated methods and
 * registers each one with the `CausalEngine` under its declared name.
 */
@Injectable()
export class WorkflowExplorer implements OnModuleInit {
  // Explicit @Inject() (rather than relying on constructor parameter type
  // reflection) keeps this resolvable under build tools that don't emit
  // TypeScript's `design:paramtypes` decorator metadata (e.g. esbuild/Vitest).
  constructor(
    @Inject(DiscoveryService) private readonly discoveryService: DiscoveryService,
    @Inject(MetadataScanner) private readonly metadataScanner: MetadataScanner,
    @Inject(CAUSAL_ENGINE) private readonly engine: CausalEngine,
  ) {}

  onModuleInit(): void {
    for (const wrapper of this.discoveryService.getProviders()) {
      const { instance } = wrapper;
      if (!instance || typeof instance !== 'object') {
        continue;
      }

      const prototype = Object.getPrototypeOf(instance);
      if (!prototype) {
        continue;
      }

      for (const methodName of this.metadataScanner.getAllMethodNames(prototype)) {
        const method = (instance as Record<string, unknown>)[methodName];
        if (typeof method !== 'function') {
          continue;
        }

        const options = Reflect.getMetadata(CAUSAL_WORKFLOW_METADATA, method) as
          | WorkflowDecoratorOptions
          | undefined;
        if (!options) {
          continue;
        }

        const handler: WorkflowHandler = (input, ctx) => method.call(instance, input, ctx);
        this.engine.registerWorkflow(options.name, handler);
      }
    }
  }
}
