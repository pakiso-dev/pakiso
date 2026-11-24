import { randomUUID } from 'node:crypto';
import { ConcurrencyConflictError } from './errors.js';
import type {
  AppendEventParams,
  CausalEventRecord,
  CausalRunRecord,
  CausalStorageAdapter,
  CreateRunParams,
  UpdateRunStatusParams,
} from './storage.js';

/**
 * Zero-dependency CausalStorageAdapter backed by in-process Maps. Intended for
 * unit tests, examples, and local development — state is lost on process exit.
 */
export class InMemoryStorageAdapter implements CausalStorageAdapter {
  private readonly runsById = new Map<string, CausalRunRecord>();
  private readonly eventsByRunId = new Map<string, CausalEventRecord[]>();
  private readonly runIdByIdempotencyKey = new Map<string, string>();
  private readonly runIdsByCorrelationKey = new Map<string, string[]>();

  async createOrGetRun(
    params: CreateRunParams,
  ): Promise<{ run: CausalRunRecord; created: boolean }> {
    if (params.idempotencyKey) {
      const existingId = this.runIdByIdempotencyKey.get(
        this.idempotencyIndexKey(params.workflowName, params.idempotencyKey),
      );
      const existing = existingId ? this.runsById.get(existingId) : undefined;
      if (existing) {
        return { run: existing, created: false };
      }
    }

    const now = new Date();
    const run: CausalRunRecord = {
      id: randomUUID(),
      workflowName: params.workflowName,
      correlationKey: params.correlationKey ?? null,
      idempotencyKey: params.idempotencyKey ?? null,
      status: 'PENDING',
      input: params.input,
      output: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };

    this.runsById.set(run.id, run);
    this.eventsByRunId.set(run.id, []);

    if (params.idempotencyKey) {
      this.runIdByIdempotencyKey.set(
        this.idempotencyIndexKey(params.workflowName, params.idempotencyKey),
        run.id,
      );
    }

    if (params.correlationKey) {
      const key = this.correlationIndexKey(params.workflowName, params.correlationKey);
      const ids = this.runIdsByCorrelationKey.get(key) ?? [];
      ids.push(run.id);
      this.runIdsByCorrelationKey.set(key, ids);
    }

    return { run, created: true };
  }

  async getRun(runId: string): Promise<CausalRunRecord | null> {
    return this.runsById.get(runId) ?? null;
  }

  async getLatestRunByCorrelationKey(
    workflowName: string,
    correlationKey: string,
  ): Promise<CausalRunRecord | null> {
    const ids = this.runIdsByCorrelationKey.get(
      this.correlationIndexKey(workflowName, correlationKey),
    );
    const latestId = ids?.at(-1);
    if (!latestId) {
      return null;
    }
    return this.runsById.get(latestId) ?? null;
  }

  async getEvents(runId: string): Promise<CausalEventRecord[]> {
    return [...(this.eventsByRunId.get(runId) ?? [])];
  }

  async appendEvent(params: AppendEventParams): Promise<CausalEventRecord> {
    const events = this.eventsByRunId.get(params.runId);
    if (!events) {
      throw new Error(`Cannot append event: unknown run "${params.runId}"`);
    }

    const latestSeq = events.at(-1)?.seq ?? 0;
    if (latestSeq !== params.expectedSeq) {
      throw new ConcurrencyConflictError(params.runId, params.expectedSeq);
    }

    const event: CausalEventRecord = {
      id: randomUUID(),
      runId: params.runId,
      seq: params.expectedSeq + 1,
      type: params.type,
      stepName: params.stepName ?? null,
      durationMs: params.durationMs ?? null,
      payload: params.payload,
      createdAt: new Date(),
    };

    events.push(event);
    return event;
  }

  async updateRunStatus(params: UpdateRunStatusParams): Promise<CausalRunRecord> {
    const run = this.runsById.get(params.runId);
    if (!run) {
      throw new Error(`Cannot update status: unknown run "${params.runId}"`);
    }

    const updated: CausalRunRecord = {
      ...run,
      status: params.status,
      output: params.output !== undefined ? params.output : run.output,
      error: params.error !== undefined ? params.error : run.error,
      updatedAt: new Date(),
    };

    this.runsById.set(run.id, updated);
    return updated;
  }

  private idempotencyIndexKey(workflowName: string, idempotencyKey: string): string {
    return `${workflowName}::${idempotencyKey}`;
  }

  private correlationIndexKey(workflowName: string, correlationKey: string): string {
    return `${workflowName}::${correlationKey}`;
  }
}
