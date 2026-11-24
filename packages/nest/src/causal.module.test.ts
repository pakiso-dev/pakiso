import 'reflect-metadata';
import type { CausalEngine, CausalStorageAdapter } from '@causal/core';
import { InMemoryStorageAdapter } from '@causal/core';
import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { CausalModule } from './causal.module.js';
import { CAUSAL_ENGINE, CAUSAL_STORAGE_ADAPTER } from './constants.js';
import { Workflow } from './decorators.js';
import type { CausalModuleOptions } from './types.js';

@Injectable()
class OrderService {
  @Workflow({ name: 'order-fulfillment' })
  async fulfill(input: { orderId: string }) {
    return { orderId: input.orderId, fulfilled: true };
  }
}

describe('CausalModule.forRoot', () => {
  it('wires storage + engine into DI and discovers @Workflow() methods', async () => {
    const storage = new InMemoryStorageAdapter();
    const moduleRef = await Test.createTestingModule({
      imports: [CausalModule.forRoot({ storage })],
      providers: [OrderService],
    }).compile();

    await moduleRef.init();

    const engine = moduleRef.get<CausalEngine>(CAUSAL_ENGINE);
    const run = await engine.startWorkflow({
      workflowName: 'order-fulfillment',
      input: { orderId: 'ORD-1' },
    });

    expect(run.status).toBe('COMPLETED');
    expect(run.output).toEqual({ orderId: 'ORD-1', fulfilled: true });

    await moduleRef.close();
  });

  it('calls storage.connect()/disconnect() on module init/destroy', async () => {
    let connected = false;
    let disconnected = false;
    class SpyStorage extends InMemoryStorageAdapter {
      async connect(): Promise<void> {
        connected = true;
      }
      async disconnect(): Promise<void> {
        disconnected = true;
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [CausalModule.forRoot({ storage: new SpyStorage() })],
    }).compile();

    await moduleRef.init();
    expect(connected).toBe(true);

    await moduleRef.close();
    expect(disconnected).toBe(true);
  });

  it('instantiates a storage adapter passed as a zero-arg constructor', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CausalModule.forRoot({ storage: InMemoryStorageAdapter })],
    }).compile();

    await moduleRef.init();
    const storage = moduleRef.get<CausalStorageAdapter>(CAUSAL_STORAGE_ADAPTER);
    expect(storage).toBeInstanceOf(InMemoryStorageAdapter);

    await moduleRef.close();
  });

  it('wraps the storage adapter in CodedStorageAdapter when CAUSAL_ENCRYPTION_KEY is set', async () => {
    const previous = process.env.CAUSAL_ENCRYPTION_KEY;
    process.env.CAUSAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

    try {
      const inner = new InMemoryStorageAdapter();
      const moduleRef = await Test.createTestingModule({
        imports: [CausalModule.forRoot({ storage: inner })],
      }).compile();
      await moduleRef.init();

      const storage = moduleRef.get<CausalStorageAdapter>(CAUSAL_STORAGE_ADAPTER);
      const { run } = await storage.createOrGetRun({
        workflowName: 'wf',
        input: { secret: 'value' },
      });

      const rawRun = await inner.getRun(run.id);
      expect(rawRun?.input.__causalEnc).toBe(true);

      await moduleRef.close();
    } finally {
      if (previous === undefined) {
        // biome-ignore lint/performance/noDelete: process.env requires delete; assigning undefined stringifies to "undefined"
        delete process.env.CAUSAL_ENCRYPTION_KEY;
      } else {
        process.env.CAUSAL_ENCRYPTION_KEY = previous;
      }
    }
  });
});

describe('CausalModule.forRootAsync', () => {
  it('resolves options via useFactory/inject', async () => {
    const STORAGE_TOKEN = 'TEST_STORAGE';

    @Module({
      providers: [{ provide: STORAGE_TOKEN, useValue: new InMemoryStorageAdapter() }],
      exports: [STORAGE_TOKEN],
    })
    class StorageProviderModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        CausalModule.forRootAsync({
          imports: [StorageProviderModule],
          inject: [STORAGE_TOKEN],
          useFactory: (storage: CausalStorageAdapter): CausalModuleOptions => ({ storage }),
        }),
      ],
    }).compile();

    await moduleRef.init();
    const storage = moduleRef.get<CausalStorageAdapter>(CAUSAL_STORAGE_ADAPTER);
    expect(storage).toBeInstanceOf(InMemoryStorageAdapter);

    await moduleRef.close();
  });
});
