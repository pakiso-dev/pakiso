import 'reflect-metadata';
import { InMemoryStorageAdapter, InProcessCausalEngine } from '@causal/core';
import { describe, expect, it, vi } from 'vitest';
import { CAUSAL_WORKFLOW_METADATA } from './constants.js';
import { Recordable, Workflow } from './decorators.js';

describe('Workflow()', () => {
  it('stamps CAUSAL_WORKFLOW_METADATA onto the decorated method', () => {
    class Service {
      @Workflow({ name: 'wf-name', redactFields: ['ssn'] })
      run() {
        return {};
      }
    }

    const metadata = Reflect.getMetadata(CAUSAL_WORKFLOW_METADATA, Service.prototype.run);
    expect(metadata).toEqual({ name: 'wf-name', redactFields: ['ssn'] });
  });
});

describe('Recordable()', () => {
  it('calls the method directly when no CausalContext is active', async () => {
    const sideEffect = vi.fn(async () => 'direct');

    class Service {
      @Recordable()
      async run() {
        return sideEffect();
      }
    }

    const result = await new Service().run();

    expect(result).toBe('direct');
    expect(sideEffect).toHaveBeenCalledTimes(1);
  });

  it('records the call as a ctx.step() when invoked inside an active workflow', async () => {
    const sideEffect = vi.fn(async () => 'recorded');

    class Service {
      @Recordable()
      async chargeCard() {
        return sideEffect();
      }
    }

    const service = new Service();
    const storage = new InMemoryStorageAdapter();
    const engine = new InProcessCausalEngine({ storage });
    engine.registerWorkflow('wf', async () => {
      const result = await service.chargeCard();
      return { result };
    });

    const run = await engine.startWorkflow({ workflowName: 'wf', input: {} });

    expect(run.status).toBe('COMPLETED');
    expect(run.output).toEqual({ result: 'recorded' });
    expect(sideEffect).toHaveBeenCalledTimes(1);

    const events = await storage.getEvents(run.id);
    expect(events.map((e) => e.type)).toEqual([
      'WORKFLOW_STARTED',
      'STEP_COMPLETED',
      'WORKFLOW_COMPLETED',
    ]);
    expect(events[1]?.stepName).toBe('chargeCard');

    // Replaying must not re-invoke the recordable method's real side effect.
    await engine.replayRun(run.id);
    expect(sideEffect).toHaveBeenCalledTimes(1);
  });
});
