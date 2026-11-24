#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';
import { runInit } from './commands/init.js';
import { runInspect } from './commands/inspect.js';
import { runReplay } from './commands/replay.js';
import { CAUSAL_CLI_VERSION } from './index.js';
import { collectStub } from './stub-parser.js';

const program = new Command();

program.name('causal').description('Causal developer CLI').version(CAUSAL_CLI_VERSION);

function withErrorHandling<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<void>,
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    try {
      await fn(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(pc.red(`✖ ${message}`));
      process.exitCode = 1;
    }
  };
}

program
  .command('init')
  .description(
    'Auto-detect the dialect from CAUSAL_DATABASE_URL, generate the Prisma client, and apply the schema',
  )
  .action(withErrorHandling(runInit));

program
  .command('inspect <runId>')
  .description("Inspect a workflow run's event journal (reads CAUSAL_DATABASE_URL)")
  .action(withErrorHandling(runInspect));

program
  .command('replay <runId>')
  .description(
    'Replay a recorded run locally against causal.config.{mjs,js}, with optional step stubs',
  )
  .option(
    '--stub <assignment>',
    'stepName=\'{"json":true}\' stub override (repeatable)',
    collectStub,
    {},
  )
  .action(
    withErrorHandling(async (runId: string, options: { stub: Record<string, unknown> }) => {
      await runReplay(runId, options.stub);
    }),
  );

program.parse();
