import type { PayloadCodec } from './security.js';
import type {
  AppendEventParams,
  CausalEventRecord,
  CausalRunRecord,
  CausalStorageAdapter,
  CreateRunParams,
  UpdateRunStatusParams,
} from './storage.js';

/**
 * Wraps any CausalStorageAdapter so run input/output and event payloads are
 * transparently encrypted via a PayloadCodec before reaching the wrapped
 * adapter, and decrypted on read. Run metadata (status, timestamps, keys)
 * and event metadata (seq, type, stepName, durationMs) pass through
 * unchanged — only the opaque payload fields are encrypted at rest.
 */
export class CodedStorageAdapter implements CausalStorageAdapter {
  constructor(
    private readonly inner: CausalStorageAdapter,
    private readonly codec: PayloadCodec,
  ) {}

  async connect(): Promise<void> {
    await this.inner.connect?.();
  }

  async disconnect(): Promise<void> {
    await this.inner.disconnect?.();
  }

  async createOrGetRun(
    params: CreateRunParams,
  ): Promise<{ run: CausalRunRecord; created: boolean }> {
    const encodedInput = await this.codec.encode(params.input);
    const { run, created } = await this.inner.createOrGetRun({ ...params, input: encodedInput });
    return { run: await this.decodeRun(run), created };
  }

  async getRun(runId: string): Promise<CausalRunRecord | null> {
    const run = await this.inner.getRun(runId);
    return run ? this.decodeRun(run) : null;
  }

  async getLatestRunByCorrelationKey(
    workflowName: string,
    correlationKey: string,
  ): Promise<CausalRunRecord | null> {
    const run = await this.inner.getLatestRunByCorrelationKey(workflowName, correlationKey);
    return run ? this.decodeRun(run) : null;
  }

  async getEvents(runId: string): Promise<CausalEventRecord[]> {
    const events = await this.inner.getEvents(runId);
    return Promise.all(events.map((event) => this.decodeEvent(event)));
  }

  async appendEvent(params: AppendEventParams): Promise<CausalEventRecord> {
    const encodedPayload = await this.codec.encode(params.payload);
    const event = await this.inner.appendEvent({ ...params, payload: encodedPayload });
    return this.decodeEvent(event);
  }

  async updateRunStatus(params: UpdateRunStatusParams): Promise<CausalRunRecord> {
    const forwarded: UpdateRunStatusParams = {
      runId: params.runId,
      status: params.status,
      ...(params.error !== undefined ? { error: params.error } : {}),
      ...(params.output !== undefined
        ? { output: params.output === null ? null : await this.codec.encode(params.output) }
        : {}),
    };
    const run = await this.inner.updateRunStatus(forwarded);
    return this.decodeRun(run);
  }

  private async decodeRun(run: CausalRunRecord): Promise<CausalRunRecord> {
    return {
      ...run,
      input: await this.codec.decode(run.input),
      output: run.output !== null ? await this.codec.decode(run.output) : null,
    };
  }

  private async decodeEvent(event: CausalEventRecord): Promise<CausalEventRecord> {
    return {
      ...event,
      payload: await this.codec.decode(event.payload),
    };
  }
}
