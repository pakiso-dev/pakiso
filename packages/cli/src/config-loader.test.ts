import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadPakisoEngineConfig } from './config-loader.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pakiso-config-test-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('loadPakisoEngineConfig', () => {
  it('loads a default-exported PakisoEngine instance', async () => {
    await writeFile(
      join(dir, 'pakiso.config.mjs'),
      `export default {
        registerWorkflow() {},
        startWorkflow() {},
        signalByRunId() {},
        signalByCorrelationKey() {},
        replayRun() {},
      };`,
    );

    const engine = await loadPakisoEngineConfig(dir);
    expect(typeof engine.replayRun).toBe('function');
  });

  it('loads a default-exported factory function returning a PakisoEngine', async () => {
    await writeFile(
      join(dir, 'pakiso.config.mjs'),
      `export default () => ({
        registerWorkflow() {},
        startWorkflow() {},
        signalByRunId() {},
        signalByCorrelationKey() {},
        replayRun() {},
      });`,
    );

    const engine = await loadPakisoEngineConfig(dir);
    expect(typeof engine.replayRun).toBe('function');
  });

  it('falls back to pakiso.config.js when .mjs is absent', async () => {
    await writeFile(
      join(dir, 'pakiso.config.js'),
      `export default {
        registerWorkflow() {},
        startWorkflow() {},
        signalByRunId() {},
        signalByCorrelationKey() {},
        replayRun() {},
      };`,
    );

    const engine = await loadPakisoEngineConfig(dir);
    expect(typeof engine.replayRun).toBe('function');
  });

  it('throws when no config file exists', async () => {
    await expect(loadPakisoEngineConfig(dir)).rejects.toThrow(
      `No pakiso.config.{mjs,js} found in ${dir}`,
    );
  });

  it('throws when the default export is not a valid PakisoEngine', async () => {
    await writeFile(join(dir, 'pakiso.config.mjs'), 'export default { notAnEngine: true };');

    await expect(loadPakisoEngineConfig(dir)).rejects.toThrow(
      'must default-export a PakisoEngine instance',
    );
  });
});
