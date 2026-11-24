import type { Type } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';

/**
 * NestJS's `ValidationPipe` normally infers which DTO class to validate a
 * `@Body()` against via TypeScript's `emitDecoratorMetadata` (the implicit
 * `design:paramtypes` it attaches to decorated methods). This repo's build
 * tooling — `tsup`/esbuild for builds, and Vitest's default esbuild
 * transform for tests — deliberately doesn't emit that metadata; see
 * `@causal/nest`'s `WorkflowExplorer`, which works around the very same gap
 * with explicit `@Inject()` instead of constructor-type reflection.
 *
 * `ValidationPipe`'s `expectedType` option is the equivalent workaround here:
 * it pins the DTO class explicitly for this parameter instead of relying on
 * inferred metadata, so validation/transformation runs correctly regardless
 * of the build tool in use.
 */
export function dtoValidationPipe(expectedType: Type<unknown>): ValidationPipe {
  return new ValidationPipe({
    expectedType,
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
}
