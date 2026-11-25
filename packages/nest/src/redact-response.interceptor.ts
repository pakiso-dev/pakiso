import { Inject, Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PAKISO_MODULE_OPTIONS } from './constants.js';
import { redactSensitiveFields } from './redaction.js';
import type { PakisoModuleOptions } from './types.js';

/**
 * Applies `redactSensitiveFields()` to a controller route's JSON response
 * body using the module-level default `redactFields`, so inspection
 * endpoints (e.g. `GET /runs/:runId`) never leak secrets or PII. Use via
 * `@UseInterceptors(RedactResponseInterceptor)` on any route that returns a
 * workflow run, event, or other payload that may embed sensitive fields.
 */
@Injectable()
export class RedactResponseInterceptor implements NestInterceptor {
  constructor(@Inject(PAKISO_MODULE_OPTIONS) private readonly moduleOptions: PakisoModuleOptions) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((body: unknown) => {
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          return body;
        }
        return redactSensitiveFields(body as Record<string, unknown>, {
          ...(this.moduleOptions.redactFields !== undefined
            ? { extraKeys: this.moduleOptions.redactFields }
            : {}),
        });
      }),
    );
  }
}
