#!/usr/bin/env node
import { Command } from 'commander';
import { CAUSAL_CLI_VERSION } from './index.js';

const program = new Command();

program.name('causal').description('Causal developer CLI').version(CAUSAL_CLI_VERSION);

program
  .command('init')
  .description('Bootstrap Causal storage schema for the configured dialect')
  .action(() => {
    console.log('causal init: not yet implemented (Phase 3.2)');
  });

program
  .command('inspect <runId>')
  .description("Inspect a workflow run's event journal")
  .action((runId: string) => {
    console.log(`causal inspect ${runId}: not yet implemented (Phase 3.2)`);
  });

program
  .command('replay <runId>')
  .description('Replay a recorded run locally with optional step stubs')
  .option('--stub <assignment...>', 'stepName=\'{"json":true}\' stub override')
  .action((runId: string) => {
    console.log(`causal replay ${runId}: not yet implemented (Phase 3.2)`);
  });

program.parse();
