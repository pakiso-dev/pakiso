import { InProcessCausalEngine } from '@causal/core';
import type { CausalStorageAdapter } from '@causal/core';
import {
  type DynamicModule,
  Inject,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
  type Provider,
} from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { CAUSAL_ENGINE, CAUSAL_MODULE_OPTIONS, CAUSAL_STORAGE_ADAPTER } from './constants.js';
import { resolveStorageAdapter } from './storage-resolution.js';
import type { CausalModuleAsyncOptions, CausalModuleOptions } from './types.js';
import { WorkflowExplorer } from './workflow-explorer.js';

const storageAdapterProvider: Provider = {
  provide: CAUSAL_STORAGE_ADAPTER,
  useFactory: (options: CausalModuleOptions) => resolveStorageAdapter(options),
  inject: [CAUSAL_MODULE_OPTIONS],
};

const engineProvider: Provider = {
  provide: CAUSAL_ENGINE,
  useFactory: (storage: CausalStorageAdapter) => new InProcessCausalEngine({ storage }),
  inject: [CAUSAL_STORAGE_ADAPTER],
};

/**
 * Wires a BYOS `CausalStorageAdapter` and `CausalEngine` into Nest's DI
 * container, connecting/disconnecting the storage adapter on module
 * init/destroy and discovering `@Workflow()`-decorated methods at bootstrap.
 */
@Module({})
export class CausalModule implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(CAUSAL_STORAGE_ADAPTER) private readonly storage: CausalStorageAdapter) {}

  static forRoot(options: CausalModuleOptions): DynamicModule {
    return {
      module: CausalModule,
      imports: [DiscoveryModule],
      providers: [
        { provide: CAUSAL_MODULE_OPTIONS, useValue: options },
        storageAdapterProvider,
        engineProvider,
        WorkflowExplorer,
      ],
      exports: [CAUSAL_STORAGE_ADAPTER, CAUSAL_ENGINE],
    };
  }

  static forRootAsync(options: CausalModuleAsyncOptions): DynamicModule {
    return {
      module: CausalModule,
      imports: [DiscoveryModule, ...(options.imports ?? [])],
      providers: [
        {
          provide: CAUSAL_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        storageAdapterProvider,
        engineProvider,
        WorkflowExplorer,
      ],
      exports: [CAUSAL_STORAGE_ADAPTER, CAUSAL_ENGINE],
    };
  }

  async onModuleInit(): Promise<void> {
    await this.storage.connect?.();
  }

  async onModuleDestroy(): Promise<void> {
    await this.storage.disconnect?.();
  }
}
