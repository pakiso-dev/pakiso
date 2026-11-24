import { describe, expect, it } from 'vitest';
import { IDEMPOTENCY_KEY_HEADER, readIdempotencyKey } from './idempotency.js';

describe('readIdempotencyKey', () => {
  it('returns the header value when present', () => {
    expect(readIdempotencyKey({ [IDEMPOTENCY_KEY_HEADER]: 'idem-1' })).toBe('idem-1');
  });

  it('returns undefined when the header is absent', () => {
    expect(readIdempotencyKey({})).toBeUndefined();
  });

  it('returns the first value when the header was sent multiple times', () => {
    expect(readIdempotencyKey({ [IDEMPOTENCY_KEY_HEADER]: ['idem-1', 'idem-2'] })).toBe('idem-1');
  });
});
