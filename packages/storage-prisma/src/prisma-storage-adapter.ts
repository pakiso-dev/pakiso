import {
  type AcquireLeaseParams,
  type AppendEventParams,
  type CausalEventRecord,
  type CausalEventType,
  type CausalRunRecord,
  type CausalRunStatus,
  type CausalStorageAdapter,
  ConcurrencyConflictError,
  type CreateRunParams,
  type ReleaseLeaseParams,
  type UpdateRunStatusParams,
} from '@causal/core';

interface CausalRunRow {
  id: string;
  workflowName: string;
  correlationKey: string | null;
  idempotencyKey: string | null;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CausalEventRow {
  id: string;
  runId: string;
  seq: number;
  type: string;
  stepName: string | null;
  durationMs: number | null;
  payload: unknown;
  createdAt: Date;
}

/**
 * Minimal structural contract a generated Prisma Client must satisfy for
 * `PrismaStorageAdapter` to work. Deliberately hand-written rather than
 * imported from one dialect's generated client: Prisma's full generated
 * `PrismaClient` type differs subtly between dialects (e.g. SQLite's
 * `$transaction` only accepts the `"Serializable"` isolation level, while
 * PostgreSQL/MySQL accept several), which breaks structural compatibility
 * if the adapter is typed against any single one of them. This reduced
 * surface — only the operations actually used — is satisfied by any of the
 * three generated clients.
 */
export interface PrismaCausalClient {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  causalRun: {
    findUnique(args: { where: Record<string, unknown> }): Promise<CausalRunRow | null>;
    findFirst(args: {
      where: Record<string, unknown>;
      orderBy: Record<string, unknown>;
    }): Promise<CausalRunRow | null>;
    create(args: { data: Record<string, unknown> }): Promise<CausalRunRow>;
    update(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<CausalRunRow>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  causalEvent: {
    findMany(args: {
      where: Record<string, unknown>;
      orderBy: Record<string, unknown>;
    }): Promise<CausalEventRow[]>;
    aggregate(args: {
      where: Record<string, unknown>;
      _max: { seq: true };
    }): Promise<{ _max: { seq: number | null } }>;
    create(args: { data: Record<string, unknown> }): Promise<CausalEventRow>;
  };
}

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

/**
 * Detects a Prisma "unique constraint failed" error by duck-typing its
 * `code` property rather than `instanceof PrismaClientKnownRequestError`.
 * The generated client resolves its own internal copy of that error class
 * (bundled with its query engine), which is a *different* class instance
 * from whatever a consumer's own `@prisma/client` import resolves — so
 * `instanceof` checks against an externally-imported reference can fail
 * even for a genuine match. The `code` string is stable across that boundary.
 */
function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === UNIQUE_CONSTRAINT_ERROR_CODE
  );
}

function mapRun(row: CausalRunRow): CausalRunRecord {
  return {
    id: row.id,
    workflowName: row.workflowName,
    correlationKey: row.correlationKey,
    idempotencyKey: row.idempotencyKey,
    status: row.status as CausalRunStatus,
    input: row.input as Record<string, unknown>,
    output: row.output as Record<string, unknown> | null,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapEvent(row: CausalEventRow): CausalEventRecord {
  return {
    id: row.id,
    runId: row.runId,
    seq: row.seq,
    type: row.type as CausalEventType,
    stepName: row.stepName,
    durationMs: row.durationMs,
    payload: row.payload as Record<string, unknown>,
    createdAt: row.createdAt,
  };
}

function byIdempotencyKey(workflowName: string, idempotencyKey: string) {
  return {
    workflowName_idempotencyKey: { workflowName, idempotencyKey },
  };
}

/**
 * CausalStorageAdapter backed by a generated Prisma Client. Works against
 * any dialect (PostgreSQL, MySQL, SQLite) generated from the matching schema
 * in `prisma/` via the reduced `PrismaCausalClient` contract above — pass in
 * whichever dialect-specific `PrismaClient` instance matches your
 * `CAUSAL_DATABASE_URL`.
 */
export class PrismaStorageAdapter implements CausalStorageAdapter {
  constructor(private readonly prisma: PrismaCausalClient) {}

  async connect(): Promise<void> {
    await this.prisma.$connect();
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async createOrGetRun(
    params: CreateRunParams,
  ): Promise<{ run: CausalRunRecord; created: boolean }> {
    if (params.idempotencyKey) {
      const existing = await this.prisma.causalRun.findUnique({
        where: byIdempotencyKey(params.workflowName, params.idempotencyKey),
      });
      if (existing) {
        return { run: mapRun(existing), created: false };
      }
    }

    try {
      const created = await this.prisma.causalRun.create({
        data: {
          workflowName: params.workflowName,
          correlationKey: params.correlationKey ?? null,
          idempotencyKey: params.idempotencyKey ?? null,
          status: 'PENDING',
          input: params.input,
          output: null,
        },
      });
      return { run: mapRun(created), created: true };
    } catch (error) {
      // Race: another writer created the same idempotencyKey between our check and create.
      if (params.idempotencyKey && isUniqueConstraintViolation(error)) {
        const existing = await this.prisma.causalRun.findUnique({
          where: byIdempotencyKey(params.workflowName, params.idempotencyKey),
        });
        if (existing) {
          return { run: mapRun(existing), created: false };
        }
      }
      throw error;
    }
  }

  async getRun(runId: string): Promise<CausalRunRecord | null> {
    const row = await this.prisma.causalRun.findUnique({ where: { id: runId } });
    return row ? mapRun(row) : null;
  }

  async getLatestRunByCorrelationKey(
    workflowName: string,
    correlationKey: string,
  ): Promise<CausalRunRecord | null> {
    const row = await this.prisma.causalRun.findFirst({
      where: { workflowName, correlationKey },
      // `id` is a UUIDv7 (time-ordered), so sorting by it is equivalent to
      // "most recently created" with far finer precision than `createdAt`,
      // which can tie within the same millisecond for fast successive creates.
      orderBy: { id: 'desc' },
    });
    return row ? mapRun(row) : null;
  }

  async getEvents(runId: string): Promise<CausalEventRecord[]> {
    const rows = await this.prisma.causalEvent.findMany({
      where: { runId },
      orderBy: { seq: 'asc' },
    });
    return rows.map(mapEvent);
  }

  async appendEvent(params: AppendEventParams): Promise<CausalEventRecord> {
    const latest = await this.prisma.causalEvent.aggregate({
      where: { runId: params.runId },
      _max: { seq: true },
    });
    const currentSeq = latest._max.seq ?? 0;
    if (currentSeq !== params.expectedSeq) {
      throw new ConcurrencyConflictError(params.runId, params.expectedSeq);
    }

    try {
      const created = await this.prisma.causalEvent.create({
        data: {
          runId: params.runId,
          seq: params.expectedSeq + 1,
          type: params.type,
          stepName: params.stepName ?? null,
          durationMs: params.durationMs ?? null,
          payload: params.payload,
        },
      });
      return mapEvent(created);
    } catch (error) {
      // Backstop against the @@unique([runId, seq]) index: the real atomicity
      // guarantee against true concurrent writers racing past the pre-check
      // above — whichever insert loses the unique-index race lands here.
      if (isUniqueConstraintViolation(error)) {
        throw new ConcurrencyConflictError(params.runId, params.expectedSeq);
      }
      throw error;
    }
  }

  async updateRunStatus(params: UpdateRunStatusParams): Promise<CausalRunRecord> {
    const updated = await this.prisma.causalRun.update({
      where: { id: params.runId },
      data: {
        status: params.status,
        ...(params.output !== undefined ? { output: params.output } : {}),
        ...(params.error !== undefined ? { error: params.error } : {}),
      },
    });
    return mapRun(updated);
  }

  async acquireLease(params: AcquireLeaseParams): Promise<boolean> {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + params.leaseDurationMs);

    // Succeeds only if no unexpired lease is held by someone else — the
    // conditional WHERE clause is the atomicity guarantee here, not a
    // separate transaction: a concurrent racer's updateMany simply matches
    // zero rows once this one commits.
    const result = await this.prisma.causalRun.updateMany({
      where: {
        id: params.runId,
        OR: [{ lockedBy: null }, { leaseExpiresAt: { lt: now } }, { lockedBy: params.leaseOwner }],
      },
      data: { lockedBy: params.leaseOwner, leaseExpiresAt },
    });
    return result.count === 1;
  }

  async releaseLease(params: ReleaseLeaseParams): Promise<void> {
    await this.prisma.causalRun.updateMany({
      where: { id: params.runId, lockedBy: params.leaseOwner },
      data: { lockedBy: null, leaseExpiresAt: null },
    });
  }
}
