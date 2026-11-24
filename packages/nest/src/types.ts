import type { CausalStorageAdapter, PayloadCodec } from '@causal/core';

export interface WorkflowDecoratorOptions {
  name: string;
  redactFields?: string[];
}

export interface CausalModuleOptions {
  /** Any BYOS CausalStorageAdapter instance or zero-argument class constructor */
  // biome-ignore lint/suspicious/noExplicitAny: mirrors the documented CausalModuleOptions contract
  storage: CausalStorageAdapter | (new (...args: any[]) => CausalStorageAdapter);
  /** Optional PayloadCodec for at-rest encryption (defaults to AES-256-GCM if CAUSAL_ENCRYPTION_KEY is set) */
  codec?: PayloadCodec;
  /** Default sensitive field names masked in HTTP inspection helpers */
  redactFields?: string[];
}

export interface CausalModuleAsyncOptions {
  // biome-ignore lint/suspicious/noExplicitAny: mirrors Nest's own ModuleMetadata['imports'] typing
  imports?: any[];
  // biome-ignore lint/suspicious/noExplicitAny: Nest DI tokens are heterogeneous (string | symbol | Type)
  inject?: any[];
  useFactory: (
    // biome-ignore lint/suspicious/noExplicitAny: factory args are resolved dynamically from `inject` tokens
    ...args: any[]
  ) => Promise<CausalModuleOptions> | CausalModuleOptions;
}
