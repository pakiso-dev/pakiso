import { describe, expect, it } from 'vitest';
import { CAUSAL_CLI_VERSION } from './index.js';

describe('@causal/cli scaffolding', () => {
  it('exposes a package version placeholder', () => {
    expect(CAUSAL_CLI_VERSION).toBe('0.1.0');
  });
});
