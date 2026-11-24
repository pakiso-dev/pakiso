import { describe, expect, it } from 'vitest';
import {
  CausalDivergenceError,
  ConcurrencyConflictError,
  WorkflowSuspendedError,
} from './errors.js';

describe('ConcurrencyConflictError', () => {
  it('carries runId/expectedSeq and formats a descriptive message', () => {
    const err = new ConcurrencyConflictError('run-1', 3);

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ConcurrencyConflictError');
    expect(err.runId).toBe('run-1');
    expect(err.expectedSeq).toBe(3);
    expect(err.message).toBe('Concurrency conflict on run "run-1": expected seq 3');
  });
});

describe('CausalDivergenceError', () => {
  it('carries runId/seq/expected/actual step and formats a descriptive message', () => {
    const err = new CausalDivergenceError('run-1', 2, 'charge-card', 'reserve-inventory');

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('CausalDivergenceError');
    expect(err.runId).toBe('run-1');
    expect(err.seq).toBe(2);
    expect(err.expectedStep).toBe('charge-card');
    expect(err.actualStep).toBe('reserve-inventory');
    expect(err.message).toBe(
      'Causal divergence on run "run-1" at seq 2: expected "charge-card", got "reserve-inventory"',
    );
  });
});

describe('WorkflowSuspendedError', () => {
  it('carries runId/gateName and formats a descriptive message', () => {
    const err = new WorkflowSuspendedError('run-1', 'manager-approval');

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('WorkflowSuspendedError');
    expect(err.runId).toBe('run-1');
    expect(err.gateName).toBe('manager-approval');
    expect(err.message).toBe('Run "run-1" suspended awaiting attestation "manager-approval"');
  });
});
