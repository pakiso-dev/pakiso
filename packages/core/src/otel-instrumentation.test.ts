import { SpanStatusCode, context, trace } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { InProcessCausalEngine } from './causal-engine.js';
import { InMemoryStorageAdapter } from './in-memory-storage-adapter.js';

let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;
let contextManager: AsyncHooksContextManager;

beforeAll(() => {
  // A production app wires its own OpenTelemetry SDK; this registers a
  // minimal in-memory one once for this file purely to assert on what
  // @causal/core emits. Without an explicit context manager, the default
  // no-op one doesn't propagate the active span across async boundaries, so
  // step spans wouldn't nest correctly under the workflow span.
  //
  // Registered once per file (not per test): @opentelemetry/api's global
  // tracer/context-manager registration doesn't cleanly support repeated
  // register→disable→register cycles within one process, so each test
  // instead just resets the shared in-memory exporter.
  exporter = new InMemorySpanExporter();
  provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  trace.setGlobalTracerProvider(provider);
  contextManager = new AsyncHooksContextManager();
  contextManager.enable();
  context.setGlobalContextManager(contextManager);
});

afterEach(() => {
  exporter.reset();
});

afterAll(async () => {
  await provider.shutdown();
  trace.disable();
  context.disable();
  contextManager.disable();
});

function spansByName(spans: ReturnType<InMemorySpanExporter['getFinishedSpans']>) {
  return Object.fromEntries(spans.map((span) => [span.name, span]));
}

function requireSpan(
  spans: Record<string, ReturnType<InMemorySpanExporter['getFinishedSpans']>[number]>,
  name: string,
) {
  const span = spans[name];
  if (!span) {
    throw new Error(`Expected a span named "${name}" to have been recorded`);
  }
  return span;
}

describe('OpenTelemetry instrumentation', () => {
  it('emits a causal.workflow.execute span with run/workflow/correlation attributes', async () => {
    const storage = new InMemoryStorageAdapter();
    const engine = new InProcessCausalEngine({ storage });
    engine.registerWorkflow('checkout', async () => ({}));

    const run = await engine.startWorkflow({
      workflowName: 'checkout',
      input: {},
      correlationKey: 'order:ORD-1',
    });

    const spans = spansByName(exporter.getFinishedSpans());
    const workflowSpan = requireSpan(spans, 'causal.workflow.execute');
    expect(workflowSpan).toBeDefined();
    expect(workflowSpan.attributes['causal.run_id']).toBe(run.id);
    expect(workflowSpan.attributes['causal.workflow_name']).toBe('checkout');
    expect(workflowSpan.attributes['causal.correlation_key']).toBe('order:ORD-1');
    expect(workflowSpan.status.code).toBe(SpanStatusCode.OK);
  });

  it('nests a step span as a child of the workflow span, tagged causal.replayed=false for live execution', async () => {
    const storage = new InMemoryStorageAdapter();
    const engine = new InProcessCausalEngine({ storage });
    engine.registerWorkflow('wf', async (_input, ctx) => {
      await ctx.step('charge-card', async () => ({ chargeId: 'ch_1' }));
      return {};
    });

    await engine.startWorkflow({ workflowName: 'wf', input: {} });

    const spans = spansByName(exporter.getFinishedSpans());
    const workflowSpan = requireSpan(spans, 'causal.workflow.execute');
    const stepSpan = requireSpan(spans, 'charge-card');
    expect(stepSpan).toBeDefined();
    expect(stepSpan.parentSpanId).toBe(workflowSpan.spanContext().spanId);
    expect(stepSpan.attributes['causal.replayed']).toBe(false);
    expect(stepSpan.status.code).toBe(SpanStatusCode.OK);
  });

  it('marks a step span ERROR with a recorded exception when the step itself throws', async () => {
    const storage = new InMemoryStorageAdapter();
    const engine = new InProcessCausalEngine({ storage });
    engine.registerWorkflow('wf', async (_input, ctx) => {
      await ctx.step('risky-step', async () => {
        throw new Error('step failed');
      });
      return {};
    });

    await engine.startWorkflow({ workflowName: 'wf', input: {} });

    const stepSpan = requireSpan(spansByName(exporter.getFinishedSpans()), 'risky-step');
    expect(stepSpan.status.code).toBe(SpanStatusCode.ERROR);
    expect(stepSpan.events.some((event) => event.name === 'exception')).toBe(true);
  });

  it('marks the workflow span ERROR with a recorded exception when the handler throws', async () => {
    const storage = new InMemoryStorageAdapter();
    const engine = new InProcessCausalEngine({ storage });
    engine.registerWorkflow('wf', async () => {
      throw new Error('boom');
    });

    await engine.startWorkflow({ workflowName: 'wf', input: {} });

    const workflowSpan = requireSpan(
      spansByName(exporter.getFinishedSpans()),
      'causal.workflow.execute',
    );
    expect(workflowSpan.status.code).toBe(SpanStatusCode.ERROR);
    expect(workflowSpan.events.some((event) => event.name === 'exception')).toBe(true);
  });

  it('marks the workflow span OK with causal.suspended when awaiting attestation', async () => {
    const storage = new InMemoryStorageAdapter();
    const engine = new InProcessCausalEngine({ storage });
    engine.registerWorkflow('wf', async (_input, ctx) => {
      await ctx.awaitAttestation('gate');
      return {};
    });

    await engine.startWorkflow({ workflowName: 'wf', input: {} });

    const workflowSpan = requireSpan(
      spansByName(exporter.getFinishedSpans()),
      'causal.workflow.execute',
    );
    expect(workflowSpan.status.code).toBe(SpanStatusCode.OK);
    expect(workflowSpan.attributes['causal.suspended']).toBe(true);
  });

  it('emits a backdated historical step span on replay, reflecting the recorded durationMs', async () => {
    const storage = new InMemoryStorageAdapter();
    const engine = new InProcessCausalEngine({ storage });
    engine.registerWorkflow('wf', async (_input, ctx) => {
      await ctx.step('slow-step', async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return 'x';
      });
      return {};
    });

    const run = await engine.startWorkflow({ workflowName: 'wf', input: {} });
    const events = await storage.getEvents(run.id);
    const recordedDurationMs = events.find((e) => e.stepName === 'slow-step')?.durationMs;
    expect(recordedDurationMs).toBeGreaterThanOrEqual(0);

    exporter.reset();
    await engine.replayRun(run.id);

    const spans = spansByName(exporter.getFinishedSpans());
    expect(spans['causal.workflow.replay']).toBeDefined();
    const replayedStepSpan = requireSpan(spans, 'slow-step');
    expect(replayedStepSpan.attributes['causal.replayed']).toBe(true);
    const observedDurationMs =
      replayedStepSpan.duration[0] * 1000 + replayedStepSpan.duration[1] / 1_000_000;
    expect(Math.round(observedDurationMs)).toBe(recordedDurationMs);
  });
});
