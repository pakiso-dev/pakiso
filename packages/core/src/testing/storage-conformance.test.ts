import { InMemoryStorageAdapter } from '../in-memory-storage-adapter.js';
import { runStorageConformanceTests } from './storage-conformance.js';

runStorageConformanceTests({
  createAdapter: () => new InMemoryStorageAdapter(),
});
