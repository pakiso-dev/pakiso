import pc from 'picocolors';
import { loadPakisoEngineConfig } from '../config-loader.js';

/**
 * Replays a recorded run locally against the project's real workflow
 * handlers (loaded from `pakiso.config.{mjs,js}`), optionally overriding
 * specific steps' results via `stubs` to reproduce bugs deterministically
 * without re-triggering real side effects.
 */
export async function runReplay(
  runId: string,
  stubs: Record<string, unknown>,
  cwd: string = process.cwd(),
): Promise<void> {
  const engine = await loadPakisoEngineConfig(cwd);
  const run = await engine.replayRun(runId, stubs);

  console.log(pc.green(`✔ Replay completed for run ${run.id}`));
  console.log(`  status: ${run.status}`);
  if (run.output !== null) {
    console.log(`  output: ${JSON.stringify(run.output, null, 2)}`);
  }
  if (run.error) {
    console.log(`  error: ${pc.red(run.error)}`);
  }
}
