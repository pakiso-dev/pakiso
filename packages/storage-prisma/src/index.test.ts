import { describe, expect, it } from 'vitest';
import { CAUSAL_STORAGE_PRISMA_VERSION } from './index.js';

describe('@causal/storage-prisma scaffolding', () => {
  it('exposes a package version placeholder', () => {
    expect(CAUSAL_STORAGE_PRISMA_VERSION).toBe('0.1.0');
  });
});
