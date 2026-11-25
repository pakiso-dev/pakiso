import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PakisoEngine } from '@pakiso/core';

const CONFIG_FILENAMES = ['pakiso.config.mjs', 'pakiso.config.js'];

type PakisoConfigModule = {
  default?: PakisoEngine | (() => PakisoEngine | Promise<PakisoEngine>);
};

function isPakisoEngine(value: unknown): value is PakisoEngine {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<PakisoEngine>).replayRun === 'function' &&
    typeof (value as Partial<PakisoEngine>).registerWorkflow === 'function'
  );
}

/**
 * Loads the user's `pakiso.config.{mjs,js}` from the current working
 * directory. It must default-export either a fully configured `PakisoEngine`
 * instance (storage adapter + workflows already registered) or a factory
 * function returning one — this is how `pakiso replay` gets access to the
 * project's real workflow handlers without the CLI needing framework-specific
 * (e.g. NestJS) bootstrapping knowledge.
 */
export async function loadPakisoEngineConfig(cwd: string = process.cwd()): Promise<PakisoEngine> {
  for (const filename of CONFIG_FILENAMES) {
    const path = join(cwd, filename);
    if (!existsSync(path)) {
      continue;
    }

    const module = (await import(pathToFileURL(path).href)) as PakisoConfigModule;
    const exported = module.default;
    const resolved = typeof exported === 'function' ? await exported() : exported;

    if (!isPakisoEngine(resolved)) {
      throw new Error(
        `${filename} must default-export a PakisoEngine instance (or a factory returning one) with your storage adapter and workflows already configured.`,
      );
    }

    return resolved;
  }

  throw new Error(
    `No pakiso.config.{mjs,js} found in ${cwd}. Export a configured PakisoEngine as the default export.`,
  );
}
