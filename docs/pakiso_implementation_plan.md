# Causal — End-to-End Implementation Plan

A phased roadmap for building **Causal**, a stateful, deterministic, auditable execution framework for Node.js and NestJS with Bring-Your-Own-Storage (BYOS), human/policy attestation gates, and local trace replay.

---

## Executive Summary: Pain Points & Manifesto

### The Pain Points Causal Solves
Modern Node.js and NestJS backends excel at stateless HTTP request-response routing, dependency injection, and ORM mapping—but break down when business processes span multiple external systems, days of human approval, or partial failures:
1. **Ephemeral In-Memory Control Flow:** When a multi-step operation crashes mid-flight (e.g., after reserving inventory or charging a card), standard async/await state disappears with the process, forcing developers to build brittle, bespoke state machines and cron-based recovery scripts.
2. **Grep-Log Forensics vs. True Causality:** Traditional text logs record *symptoms* rather than a deterministic execution journal, making it nearly impossible to reproduce production edge cases or prove *why* a decision occurred during an audit.
3. **Awkward Human & Policy Sign-Offs:** Pausing a workflow for days while waiting on an approval, KYC review, or external webhook typically fragments business logic across disconnected controllers, database status flags, and message queues.
4. **Data Boundary & Compliance Leakage:** Persisting raw inputs/outputs for debugging or replay often exposes PII and secrets in plaintext, while lacking built-in retention, redaction, or tamper-evident guarantees.
5. **Storage Lock-In:** Coupling workflow orchestration to a single database vendor forces teams into heavy infrastructure dependencies even for local development, testing, or lightweight deployments.

### The Causal Manifesto
* **History Is a First-Class Execution Journal:** Execution traces are structured, append-only causal records—not unstructured log lines.
* **Deterministic Local Replay Beats Guesswork:** Any recorded run can be replayed locally against real history with selective step stubs, catching code drift immediately (`CausalDivergenceError`).
* **Human & Policy Gates Belong in Control Flow:** `ctx.awaitAttestation()` suspends execution cleanly and resumes days later from the exact checkpoint without re-running completed side effects.
* **Trust, Privacy & Immutability Are Data-Layer Primitives:** Encryption at rest (`PayloadCodec`), API redaction, domain transaction propagation (`tx`), and tamper-evident append-only rules are built into the persistence boundary.
* **Bring Your Own Storage (BYOS):** The core runtime owns execution semantics while delegating persistence to a clean, database-agnostic storage contract.

---

## Architecture Overview

Causal is structured as a small monorepo separating the framework-agnostic deterministic execution engine from the NestJS dependency-injection and HTTP transport layer:

* **`@causal/core`** — Zero-dependency execution engine (`AsyncLocalStorage` context, deterministic replay, `CausalDivergenceError`, `ctx.step()` with automatic wall-clock step timing, `ctx.awaitAttestation()`, `CausalStorageAdapter` BYOS contract, `CodedStorageAdapter` AES-256-GCM encryption, and `InMemoryStorageAdapter`).
* **`@causal/nest`** — NestJS module (`CausalModule.forRoot()` / `forRootAsync()`), `@Workflow()` / `@Recordable()` decorators, provider discovery, HTTP redaction helpers, and REST integration patterns.
* **`@causal/storage-prisma`** *(Optional first-party adapter)* — Multi-dialect Prisma adapter (PostgreSQL, MySQL, SQLite) with `CAUSAL_DATABASE_URL` isolation and PostgreSQL `prevent_event_mutation` trigger support.
* **`@causal/cli`** — Developer CLI (`causal init`, `causal inspect`, `causal replay`) for schema bootstrapping and local trace debugging with selective step stubs.

---

## Core Contracts & TypeScript Interfaces

Use these canonical interfaces as the source of truth across `@causal/core`, `@causal/nest`, and any BYOS storage adapters.

### 1. BYOS Storage Contract (`@causal/core/storage`)

```typescript
export type CausalRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'WAITING_ATTESTATION'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type CausalEventType =
  | 'WORKFLOW_STARTED'
  | 'STEP_COMPLETED'
  | 'ATTESTATION_REQUESTED'
  | 'ATTESTATION_RECEIVED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_FAILED'
  | 'WORKFLOW_CANCELLED';

export interface CausalRunRecord<
  TInput = Record<string, unknown>,
  TOutput = Record<string, unknown>,
> {
  id: string;
  workflowName: string;
  correlationKey: string | null;
  idempotencyKey: string | null;
  status: CausalRunStatus;
  input: TInput;
  output: TOutput | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CausalEventRecord<TPayload = Record<string, unknown>> {
  id: string;
  runId: string;
  seq: number;
  type: CausalEventType;
  stepName: string | null;
  /** Wall-clock execution time in milliseconds for STEP_COMPLETED events; null for all other event types */
  durationMs: number | null;
  payload: TPayload;
  createdAt: Date;
}

export interface CreateRunParams {
  workflowName: string;
  input: Record<string, unknown>;
  correlationKey?: string;
  idempotencyKey?: string;
}

export interface AppendEventParams {
  runId: string;
  /** Optimistic concurrency guard: adapter MUST reject if latest seq !== expectedSeq */
  expectedSeq: number;
  type: CausalEventType;
  stepName?: string;
  /** Wall-clock execution time in milliseconds, measured by ctx.step() around fn() */
  durationMs?: number;
  payload: Record<string, unknown>;
}

export interface UpdateRunStatusParams {
  runId: string;
  status: CausalRunStatus;
  output?: Record<string, unknown> | null;
  error?: string | null;
}

export interface CausalStorageAdapter {
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;

  createOrGetRun(
    params: CreateRunParams,
  ): Promise<{ run: CausalRunRecord; created: boolean }>;

  getRun(runId: string): Promise<CausalRunRecord | null>;

  getLatestRunByCorrelationKey(
    workflowName: string,
    correlationKey: string,
  ): Promise<CausalRunRecord | null>;

  /** Must return events strictly ordered ascending by `seq` (1..N) */
  getEvents(runId: string): Promise<CausalEventRecord[]>;

  /** Must enforce `expectedSeq` atomically and assign `seq = expectedSeq + 1` */
  appendEvent(params: AppendEventParams): Promise<CausalEventRecord>;

  updateRunStatus(params: UpdateRunStatusParams): Promise<CausalRunRecord>;
}
```

### 2. Payload Encryption & Security Boundary (`@causal/core/security`)

```typescript
export interface EncryptedEnvelope {
  __causalEnc: true;
  kid: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

export interface PayloadCodec {
  encode(plain: Record<string, unknown>): Promise<Record<string, unknown>>;
  decode(stored: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface RedactionOptions {
  /** Additional case-insensitive field keys to mask as "[REDACTED]" */
  extraKeys?: string[];
}
```

### 3. Execution Context & Replay Engine (`@causal/core/runtime`)

```typescript
export interface StepOptions {
  /** Optional stub value injected during local `causal replay` */
  stubResult?: unknown;
}

export interface AttestationOptions {
  /** Optional timeout/deadline metadata recorded on ATTESTATION_REQUESTED */
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface CausalContext {
  readonly runId: string;
  readonly workflowName: string;
  readonly correlationKey: string | null;
  readonly isReplaying: boolean;

  /**
   * Deterministic, replay-safe side-effect boundary.
   * Automatically measures the wall-clock duration of `fn()` and records it as
   * `durationMs` on the resulting STEP_COMPLETED event. Duration is observability
   * data only — it is never compared during replay and does not affect
   * `CausalDivergenceError` checks.
   */
  step<TResult>(
    stepName: string,
    fn: () => Promise<TResult> | TResult,
    options?: StepOptions,
  ): Promise<TResult>;

  /** Durable human/policy sign-off gate; suspends run until signal arrives */
  awaitAttestation<TPayload = Record<string, unknown>>(
    gateName: string,
    options?: AttestationOptions,
  ): Promise<TPayload>;

  /** Deterministic clock & ID helpers recorded as steps */
  now(): Promise<Date>;
  uuid(): Promise<string>;
}

export type WorkflowHandler<TInput = any, TOutput = any> = (
  input: TInput,
  ctx: CausalContext,
) => Promise<TOutput>;

export interface StartWorkflowParams<TInput = Record<string, unknown>> {
  workflowName: string;
  input: TInput;
  correlationKey?: string;
  idempotencyKey?: string;
}

export interface SignalWorkflowParams<TPayload = Record<string, unknown>> {
  gateName: string;
  payload: TPayload;
}

export interface CausalEngine {
  registerWorkflow(name: string, handler: WorkflowHandler): void;
  startWorkflow<TInput extends Record<string, unknown>>(
    params: StartWorkflowParams<TInput>,
  ): Promise<CausalRunRecord>;
  signalByRunId<TPayload extends Record<string, unknown>>(
    runId: string,
    signal: SignalWorkflowParams<TPayload>,
  ): Promise<void>;
  signalByCorrelationKey<TPayload extends Record<string, unknown>>(
    workflowName: string,
    correlationKey: string,
    signal: SignalWorkflowParams<TPayload>,
  ): Promise<void>;
  replayRun(
    runId: string,
    stubs?: Record<string, unknown>,
  ): Promise<CausalRunRecord>;
}
```

### 4. Core Domain Errors (`@causal/core/errors`)

```typescript
/** Thrown by storage adapters when expectedSeq does not match latest stream seq */
export class ConcurrencyConflictError extends Error {
  constructor(
    public readonly runId: string,
    public readonly expectedSeq: number,
  ) {
    super(`Concurrency conflict on run "${runId}": expected seq ${expectedSeq}`);
    this.name = 'ConcurrencyConflictError';
  }
}

/** Thrown during replay if code executes a different step/gate than recorded in journal */
export class CausalDivergenceError extends Error {
  constructor(
    public readonly runId: string,
    public readonly seq: number,
    public readonly expectedStep: string,
    public readonly actualStep: string,
  ) {
    super(
      `Causal divergence on run "${runId}" at seq ${seq}: expected "${expectedStep}", got "${actualStep}"`,
    );
    this.name = 'CausalDivergenceError';
  }
}

/** Internal control-flow signal caught by CausalEngine to park run in WAITING_ATTESTATION */
export class WorkflowSuspendedError extends Error {
  constructor(
    public readonly runId: string,
    public readonly gateName: string,
  ) {
    super(`Run "${runId}" suspended awaiting attestation "${gateName}"`);
    this.name = 'WorkflowSuspendedError';
  }
}
```

### 5. NestJS Adapter Contracts (`@causal/nest`)

```typescript
export interface WorkflowDecoratorOptions {
  name: string;
  redactFields?: string[];
}

export interface CausalModuleOptions {
  /** Any BYOS CausalStorageAdapter instance or class constructor */
  storage: CausalStorageAdapter | (new (...args: any[]) => CausalStorageAdapter);
  /** Optional PayloadCodec for at-rest encryption (defaults to AES-256-GCM if CAUSAL_ENCRYPTION_KEY is set) */
  codec?: PayloadCodec;
  /** Default sensitive field names masked in HTTP inspection helpers */
  redactFields?: string[];
}

export interface CausalModuleAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (
    ...args: any[]
  ) => Promise<CausalModuleOptions> | CausalModuleOptions;
}
```

---

## Phase 1: `@causal/core` — Storage Contract & Replay Engine
**Goal:** Establish a framework-agnostic core that guarantees deterministic execution, optimistic concurrency, and clean suspension/resumption.

### 1.1 BYOS Storage Contract (`CausalStorageAdapter`)
* [ ] Implement `CausalStorageAdapter` types and error classes (`ConcurrencyConflictError`, `CausalDivergenceError`, `WorkflowSuspendedError`).
* [ ] Enforce optimistic concurrency on `appendEvent` via `expectedSeq`.
* [ ] Support `correlationKey` indexing (`getLatestRunByCorrelationKey`) alongside `idempotencyKey` deduplication.
* [ ] Build `InMemoryStorageAdapter` for zero-dependency unit testing.
* [ ] Build a reusable `runStorageConformanceTests()` suite so any custom BYOS adapter (Drizzle, TypeORM, DynamoDB, Redis) can verify compliance.

### 1.2 Deterministic Execution & `AsyncLocalStorage` Context
* [ ] Implement `CausalContext` backed by `AsyncLocalStorage` so `ctx.step()`, `ctx.now()`, and `ctx.uuid()` preserve causality across async boundaries.
* [ ] Implement `CausalDivergenceError` checks during replay against `seq: 1..N`.
* [ ] Instrument `ctx.step()` to measure wall-clock execution time around `fn()` (e.g., via `performance.now()`) and persist it as `durationMs` on the `STEP_COMPLETED` event, independent of divergence checks.
* [ ] Implement `ctx.awaitAttestation(gateName)` to suspend runs (`WAITING_ATTESTATION`) and resume on signal arrival without re-executing prior steps.

### 1.3 Security & Payload Boundary (`CodedStorageAdapter`)
* [ ] Implement `PayloadCodec` interface and `Aes256GcmPayloadCodec` (`CAUSAL_ENCRYPTION_KEY`, key rotation `kid`, per-payload random IV).
* [ ] Wrap any `CausalStorageAdapter` in `CodedStorageAdapter` so encryption at rest works automatically across all BYOS backends.

---

## Phase 2: `@causal/nest` — NestJS Integration & REST Ergonomics
**Goal:** Make Causal idiomatic in NestJS applications with declarative decorators and clean HTTP control-plane helpers.

### 2.1 Module & Lifecycle Configuration
* [ ] Implement `CausalModule.forRoot(options)` and `CausalModule.forRootAsync(options)` accepting any `CausalStorageAdapter`.
* [ ] Hook into `OnModuleInit` / `OnModuleDestroy` to invoke `storage.connect?.()` and `storage.disconnect?.()`.

### 2.2 Decorators & Discovery
* [ ] Implement `@Workflow({ name, redactFields })` and `@Recordable()` decorators using `SetMetadata`.
* [ ] Scan NestJS providers on bootstrap via `DiscoveryService` + `MetadataScanner` to register workflow handlers with `CausalEngine`.

### 2.3 REST Control Plane & Redaction Helpers
* [ ] Support starting workflows with `Idempotency-Key` + `correlationKey` (e.g., `order:ORD-99`) and returning `202 Accepted`.
* [ ] Support signaling suspended runs by `runId` or `correlationKey` (e.g., `POST /orders/:orderId/approve`).
* [ ] Provide `redactSensitiveFields()` utilities/interceptors so inspection endpoints (`GET /runs/:runId`, `GET /orders/:orderId/status`) never leak secrets or PII.

---

## Phase 3: `@causal/storage-prisma` & `@causal/cli`
**Goal:** Provide a turnkey relational storage adapter and developer CLI while keeping BYOS completely optional.

### 3.1 Multi-Dialect Prisma Adapter
* [ ] Create portable Prisma schemas (`postgresql`, `mysql`, `sqlite`) implementing `CausalStorageAdapter`.
* [ ] Persist a nullable `duration_ms` column on `causal_events` across all three dialects, sourced from `AppendEventParams.durationMs`.
* [ ] Support `CAUSAL_DATABASE_URL` with automatic fallback to `DATABASE_URL`.
* [ ] Support transaction propagation (`tx`) so domain mutations and `STEP_COMPLETED` events can commit atomically.

### 3.2 CLI Tooling (`causal init` & `causal replay`)
* [ ] **`causal init`**: Auto-detect database dialect from `CAUSAL_DATABASE_URL`, apply schema idempotently, and on PostgreSQL install the `prevent_event_mutation` trigger on `causal_events`.
* [ ] **`causal replay <runId>`**: Fetch a production or staging run trace and replay it locally with selective step stubs (`--stub capture-payment='{"chargeId":"test_123"}'`) to reproduce bugs deterministically.

---

## Phase 4: Production Hardening & Observability
**Goal:** Prepare Causal for multi-replica production deployments and long-running workflows.

* [ ] **Distributed Worker Locking / Lease Management:** Prevent two horizontal pods from replaying the same run concurrently when signals arrive simultaneously.
* [ ] **Attestation Deadlines & Timers:** Add durable timeout scheduling so gates waiting days for approval can auto-escalate or expire cleanly.
* [ ] **Retention & Crypto-Shredding:** Add TTL archival/purging for completed runs and per-run encryption keys for GDPR/privacy erasure compliance.

---

## Phase 5: `@causal/dashboard` — Operational Visibility
**Goal:** Let a live app's own team browse runs and inspect their full event
journals from a browser, without DB/VPN access or a hand-rolled REST
controller per app.

* [ ] **`listRuns` storage capability:** Add an optional `listRuns(params)` method to `CausalStorageAdapter` (filter by `workflowName`/`status`, cursor-paginated, most-recently-created first), implemented in `InMemoryStorageAdapter` and `PrismaStorageAdapter`.
* [ ] **`CausalDashboardModule`:** An embeddable NestJS module reusing the host app's own `CAUSAL_STORAGE_ADAPTER` provider, exposing a read-only JSON API (`GET /causal-dashboard/api/runs`, `GET /causal-dashboard/api/runs/:id`) and a bundled static SPA, served without any Express/Fastify-specific static-file dependency.
* [ ] **View-only for now:** Signaling gates / cancelling / retrying runs from the dashboard is intentionally out of scope for this phase — see the REST control plane docs for building that yourself in the meantime.

* [ ] **OpenTelemetry Tracing:** Emit spans per workflow run, replay pass, and step execution correlated by `runId` and `correlationKey`; during replay, backdate step spans using the journal's recorded `durationMs` instead of live timing, since replayed steps re-execute near-instantly.