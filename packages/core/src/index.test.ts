import { describe, expect, it } from 'vitest';
import { CAUSAL_CORE_VERSION } from './index.js';

describe('@causal/core scaffolding', () => {
  it('exposes a package version placeholder', () => {
    expect(CAUSAL_CORE_VERSION).toBe('0.1.0');
  });
});
