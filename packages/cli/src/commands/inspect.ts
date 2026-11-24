import Table from 'cli-table3';
import pc from 'picocolors';
import { createStorageAdapterFromEnv } from '../storage-from-env.js';

function colorizeStatus(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return pc.green(status);
    case 'FAILED':
      return pc.red(status);
    case 'WAITING_ATTESTATION':
      return pc.yellow(status);
    case 'CANCELLED':
      return pc.dim(status);
    default:
      return pc.cyan(status);
  }
}

/** Prints a run's metadata and its full event journal (including per-step durationMs). */
export async function runInspect(runId: string): Promise<void> {
  const storage = await createStorageAdapterFromEnv();

  try {
    const run = await storage.getRun(runId);
    if (!run) {
      throw new Error(`No run found with id "${runId}"`);
    }
    const events = await storage.getEvents(runId);

    console.log(pc.bold(`Run ${run.id}`));
    console.log(`  workflow:       ${run.workflowName}`);
    console.log(`  status:         ${colorizeStatus(run.status)}`);
    console.log(`  correlationKey: ${run.correlationKey ?? pc.dim('(none)')}`);
    console.log(`  idempotencyKey: ${run.idempotencyKey ?? pc.dim('(none)')}`);
    console.log(`  createdAt:      ${run.createdAt.toISOString()}`);
    console.log(`  updatedAt:      ${run.updatedAt.toISOString()}`);
    if (run.error) {
      console.log(`  error:          ${pc.red(run.error)}`);
    }
    console.log('');

    const table = new Table({ head: ['seq', 'type', 'step/gate', 'durationMs', 'createdAt'] });
    for (const event of events) {
      table.push([
        String(event.seq),
        event.type,
        event.stepName ?? pc.dim('—'),
        event.durationMs !== null ? String(event.durationMs) : pc.dim('—'),
        event.createdAt.toISOString(),
      ]);
    }
    console.log(table.toString());
  } finally {
    await storage.disconnect?.();
  }
}
