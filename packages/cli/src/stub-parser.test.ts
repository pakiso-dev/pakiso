import { describe, expect, it } from 'vitest';
import { collectStub } from './stub-parser.js';

describe('collectStub', () => {
  it('parses a JSON value', () => {
    expect(collectStub('charge-card={"chargeId":"ch_1"}', {})).toEqual({
      'charge-card': { chargeId: 'ch_1' },
    });
  });

  it('parses a JSON primitive value', () => {
    expect(collectStub('retries=3', {})).toEqual({ retries: 3 });
    expect(collectStub('approved=true', {})).toEqual({ approved: true });
  });

  it('falls back to a plain string when the value is not valid JSON', () => {
    expect(collectStub('note=hello world', {})).toEqual({ note: 'hello world' });
  });

  it('accumulates multiple stubs across repeated calls', () => {
    const afterFirst = collectStub('a=1', {});
    const afterSecond = collectStub('b=2', afterFirst);
    expect(afterSecond).toEqual({ a: 1, b: 2 });
  });

  it('throws when the assignment has no "=" separator', () => {
    expect(() => collectStub('no-equals-sign', {})).toThrow(
      'Invalid --stub "no-equals-sign": expected the form stepName=jsonValue',
    );
  });
});
