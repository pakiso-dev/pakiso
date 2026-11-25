import type { PakisoStorageAdapter, PayloadCodec } from '@pakiso/core';

export interface WorkflowDecoratorOptions {
  name: string;
  redactFields?: string[];
}

export interface PakisoModuleOptions {
  /** Any BYOS PakisoStorageAdapter instance or zero-argument class constructor */
  // biome-ignore lint/suspicious/noExplicitAny: mirrors the documented PakisoModuleOptions contract
  storage: PakisoStorageAdapter | (new (...args: any[]) => PakisoStorageAdapter);
  /** Optional PayloadCodec for at-rest encryption (defaults to AES-256-GCM if PAKISO_ENCRYPTION_KEY is set) */
  codec?: PayloadCodec;
  /** Default sensitive field names masked in HTTP inspection helpers */
  redactFields?: string[];
}

export interface PakisoModuleAsyncOptions {
  // biome-ignore lint/suspicious/noExplicitAny: mirrors Nest's own ModuleMetadata['imports'] typing
  imports?: any[];
  // biome-ignore lint/suspicious/noExplicitAny: Nest DI tokens are heterogeneous (string | symbol | Type)
  inject?: any[];
  useFactory: (
    // biome-ignore lint/suspicious/noExplicitAny: factory args are resolved dynamically from `inject` tokens
    ...args: any[]
  ) => Promise<PakisoModuleOptions> | PakisoModuleOptions;
}
