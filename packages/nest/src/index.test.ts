import { describe, expect, it } from 'vitest';
import { CAUSAL_NEST_VERSION } from './index.js';

describe('@causal/nest scaffolding', () => {
  it('exposes a package version placeholder', () => {
    expect(CAUSAL_NEST_VERSION).toBe('0.1.0');
  });
});
