import {
  type DynamicModule,
  Inject,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
  type Provider,
} from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { InProcessPakisoEngine } from '@pakiso/core';
import type { PakisoStorageAdapter } from '@pakiso/core';
import { PAKISO_ENGINE, PAKISO_MODULE_OPTIONS, PAKISO_STORAGE_ADAPTER } from './constants.js';
import { resolveStorageAdapter } from './storage-resolution.js';
import type { PakisoModuleAsyncOptions, PakisoModuleOptions } from './types.js';
import { WorkflowExplorer } from './workflow-explorer.js';

const storageAdapterProvider: Provider = {
  provide: PAKISO_STORAGE_ADAPTER,
  useFactory: (options: PakisoModuleOptions) => resolveStorageAdapter(options),
  inject: [PAKISO_MODULE_OPTIONS],
};

const engineProvider: Provider = {
  provide: PAKISO_ENGINE,
  useFactory: (storage: PakisoStorageAdapter) => new InProcessPakisoEngine({ storage }),
  inject: [PAKISO_STORAGE_ADAPTER],
};

/**
 * Wires a BYOS `PakisoStorageAdapter` and `PakisoEngine` into Nest's DI
 * container, connecting/disconnecting the storage adapter on module
 * init/destroy and discovering `@Workflow()`-decorated methods at bootstrap.
 */
@Module({})
export class PakisoModule implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(PAKISO_STORAGE_ADAPTER) private readonly storage: PakisoStorageAdapter) {}

  static forRoot(options: PakisoModuleOptions): DynamicModule {
    return {
      module: PakisoModule,
      // Global so any feature module can `@Inject(PAKISO_ENGINE)` /
      // `@Inject(PAKISO_STORAGE_ADAPTER)` — or use `RedactResponseInterceptor`,
      // which itself depends on `PAKISO_MODULE_OPTIONS` — without every
      // module that uses Pakiso having to re-import `PakisoModule` (which
      // would otherwise instantiate a second, independent storage adapter).
      global: true,
      imports: [DiscoveryModule],
      providers: [
        { provide: PAKISO_MODULE_OPTIONS, useValue: options },
        storageAdapterProvider,
        engineProvider,
        WorkflowExplorer,
      ],
      exports: [PAKISO_MODULE_OPTIONS, PAKISO_STORAGE_ADAPTER, PAKISO_ENGINE],
    };
  }

  static forRootAsync(options: PakisoModuleAsyncOptions): DynamicModule {
    return {
      module: PakisoModule,
      global: true,
      imports: [DiscoveryModule, ...(options.imports ?? [])],
      providers: [
        {
          provide: PAKISO_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        storageAdapterProvider,
        engineProvider,
        WorkflowExplorer,
      ],
      exports: [PAKISO_MODULE_OPTIONS, PAKISO_STORAGE_ADAPTER, PAKISO_ENGINE],
    };
  }

  async onModuleInit(): Promise<void> {
    await this.storage.connect?.();
  }

  async onModuleDestroy(): Promise<void> {
    await this.storage.disconnect?.();
  }
}
