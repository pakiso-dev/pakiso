import { describe, expect, it } from 'vitest';
import { redactSensitiveFields } from './redaction.js';

describe('redactSensitiveFields', () => {
  it('masks known sensitive keys case-insensitively', () => {
    const result = redactSensitiveFields({
      Password: 'hunter2',
      SSN: '123-45-6789',
      orderId: 'ORD-1',
    });

    expect(result).toEqual({
      Password: '[REDACTED]',
      SSN: '[REDACTED]',
      orderId: 'ORD-1',
    });
  });

  it('masks matching keys at arbitrary nested depth', () => {
    const result = redactSensitiveFields({
      user: { profile: { ssn: '123-45-6789', name: 'Ada' } },
    });

    expect(result).toEqual({
      user: { profile: { ssn: '[REDACTED]', name: 'Ada' } },
    });
  });

  it('masks matching keys inside arrays', () => {
    const result = redactSensitiveFields({
      cards: [{ cardNumber: '4111111111111111' }, { cardNumber: '4000000000000002' }],
    });

    expect(result).toEqual({
      cards: [{ cardNumber: '[REDACTED]' }, { cardNumber: '[REDACTED]' }],
    });
  });

  it('masks additional keys supplied via extraKeys', () => {
    const result = redactSensitiveFields(
      { internalNote: 'do not share' },
      { extraKeys: ['internalNote'] },
    );
    expect(result).toEqual({ internalNote: '[REDACTED]' });
  });

  it('does not mutate the original input', () => {
    const input = { password: 'hunter2' };
    const result = redactSensitiveFields(input);

    expect(input.password).toBe('hunter2');
    expect(result.password).toBe('[REDACTED]');
  });

  it('replaces a circular reference with a marker instead of recursing forever', () => {
    const input: Record<string, unknown> = { name: 'Ada' };
    input.self = input;

    const result = redactSensitiveFields(input);

    expect(result.name).toBe('Ada');
    expect(result.self).toBe('[CIRCULAR]');
  });

  it('allows the same object to appear in two separate non-cyclical branches', () => {
    const shared = { note: 'shared' };
    const input = { a: shared, b: shared };

    const result = redactSensitiveFields(input);

    expect(result).toEqual({ a: { note: 'shared' }, b: { note: 'shared' } });
  });
});
