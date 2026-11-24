import { InMemoryStorageAdapter } from '@causal/core';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { RedactResponseInterceptor } from './redact-response.interceptor.js';
import type { CausalModuleOptions } from './types.js';

function createCallHandler(body: unknown): CallHandler {
  return { handle: () => of(body) };
}

describe('RedactResponseInterceptor', () => {
  it('redacts sensitive fields from an object response body using module redactFields', async () => {
    const options: CausalModuleOptions = {
      storage: new InMemoryStorageAdapter(),
      redactFields: ['internalNote'],
    };
    const interceptor = new RedactResponseInterceptor(options);

    const result = await lastValueFrom(
      interceptor.intercept(
        {} as ExecutionContext,
        createCallHandler({ password: 'hunter2', internalNote: 'secret', orderId: 'ORD-1' }),
      ),
    );

    expect(result).toEqual({
      password: '[REDACTED]',
      internalNote: '[REDACTED]',
      orderId: 'ORD-1',
    });
  });

  it('passes through non-object response bodies unchanged', async () => {
    const options: CausalModuleOptions = { storage: new InMemoryStorageAdapter() };
    const interceptor = new RedactResponseInterceptor(options);

    const arrayResult = await lastValueFrom(
      interceptor.intercept({} as ExecutionContext, createCallHandler([1, 2, 3])),
    );
    const stringResult = await lastValueFrom(
      interceptor.intercept({} as ExecutionContext, createCallHandler('ok')),
    );
    const nullResult = await lastValueFrom(
      interceptor.intercept({} as ExecutionContext, createCallHandler(null)),
    );

    expect(arrayResult).toEqual([1, 2, 3]);
    expect(stringResult).toBe('ok');
    expect(nullResult).toBeNull();
  });
});
