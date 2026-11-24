import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CausalEngine } from '@causal/core';

const CONFIG_FILENAMES = ['causal.config.mjs', 'causal.config.js'];

type CausalConfigModule = {
  default?: CausalEngine | (() => CausalEngine | Promise<CausalEngine>);
};

function isCausalEngine(value: unknown): value is CausalEngine {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<CausalEngine>).replayRun === 'function' &&
    typeof (value as Partial<CausalEngine>).registerWorkflow === 'function'
  );
}

/**
 * Loads the user's `causal.config.{mjs,js}` from the current working
 * directory. It must default-export either a fully configured `CausalEngine`
 * instance (storage adapter + workflows already registered) or a factory
 * function returning one — this is how `causal replay` gets access to the
 * project's real workflow handlers without the CLI needing framework-specific
 * (e.g. NestJS) bootstrapping knowledge.
 */
export async function loadCausalEngineConfig(cwd: string = process.cwd()): Promise<CausalEngine> {
  for (const filename of CONFIG_FILENAMES) {
    const path = join(cwd, filename);
    if (!existsSync(path)) {
      continue;
    }

    const module = (await import(pathToFileURL(path).href)) as CausalConfigModule;
    const exported = module.default;
    const resolved = typeof exported === 'function' ? await exported() : exported;

    if (!isCausalEngine(resolved)) {
      throw new Error(
        `${filename} must default-export a CausalEngine instance (or a factory returning one) with your storage adapter and workflows already configured.`,
      );
    }

    return resolved;
  }

  throw new Error(
    `No causal.config.{mjs,js} found in ${cwd}. Export a configured CausalEngine as the default export.`,
  );
}
