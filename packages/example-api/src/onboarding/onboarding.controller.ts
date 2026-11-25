import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { PakisoEngine, PakisoStorageAdapter } from '@pakiso/core';
import {
  PAKISO_ENGINE,
  PAKISO_STORAGE_ADAPTER,
  RedactResponseInterceptor,
  readIdempotencyKey,
} from '@pakiso/nest';
import { dtoValidationPipe } from '../common/dto-validation.pipe.js';
import { ComplianceApprovalDto } from './dto/compliance-approval.dto.js';
import { CreateOnboardingDto } from './dto/create-onboarding.dto.js';

const WORKFLOW_NAME = 'user-onboarding';
const RUN_ID_PARAM = { name: 'runId', description: 'Run id returned from POST /onboarding' };

function correlationKeyFor(email: string): string {
  return `onboarding:${email}`;
}

/**
 * REST control plane for the `user-onboarding` workflow. Demonstrates the
 * three ergonomic pieces `@pakiso/nest` adds on top of the raw `PakisoEngine`:
 * starting a run idempotently (`Idempotency-Key` header + `correlationKey`),
 * signaling a suspended run's attestation gates by `runId`, and redacting
 * sensitive fields (`RedactResponseInterceptor`) from inspection responses.
 */
@ApiTags('onboarding')
@Controller('onboarding')
@UseInterceptors(RedactResponseInterceptor)
export class OnboardingController {
  constructor(
    @Inject(PAKISO_ENGINE) private readonly engine: PakisoEngine,
    @Inject(PAKISO_STORAGE_ADAPTER) private readonly storage: PakisoStorageAdapter,
  ) {}

  /** Starts a new onboarding run. Returns 202 since the workflow suspends almost immediately. */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Start a new onboarding run',
    description:
      'Suspends almost immediately awaiting the email-verified attestation gate. ' +
      'Reusing the same Idempotency-Key returns the existing run instead of starting a new one.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Dedupes retried starts against the same run.',
  })
  @ApiBody({ type: CreateOnboardingDto })
  @ApiResponse({ status: 202, description: 'Run created (or found, if Idempotency-Key matched).' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  async start(
    @Body(dtoValidationPipe(CreateOnboardingDto)) dto: CreateOnboardingDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const correlationKey = correlationKeyFor(dto.email);
    const idempotencyKey = readIdempotencyKey(headers);

    const run = await this.engine.startWorkflow({
      workflowName: WORKFLOW_NAME,
      input: { email: dto.email, fullName: dto.fullName, dateOfBirth: dto.dateOfBirth },
      correlationKey,
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
    });

    return { runId: run.id, status: run.status, correlationKey };
  }

  /** Signals the `email-verified` attestation gate (e.g. after the user clicks an email link). */
  @Post(':runId/email-verified')
  @ApiOperation({ summary: 'Signal the email-verified attestation gate' })
  @ApiParam(RUN_ID_PARAM)
  @ApiResponse({ status: 201, description: 'Run status after resuming past the gate.' })
  @ApiResponse({ status: 404, description: 'No run found with this runId.' })
  async verifyEmail(@Param('runId') runId: string) {
    await this.engine.signalByRunId(runId, {
      gateName: 'email-verified',
      payload: { verifiedAt: new Date().toISOString() },
    });
    return this.getRun(runId);
  }

  /** Signals the `compliance-approval` attestation gate (only ever awaited for high-risk applicants). */
  @Post(':runId/compliance-approval')
  @ApiOperation({
    summary: 'Signal the compliance-approval attestation gate',
    description:
      'Only ever awaited for applicants the (deterministic, hashed) KYC check flags as high-risk.',
  })
  @ApiParam(RUN_ID_PARAM)
  @ApiBody({ type: ComplianceApprovalDto })
  @ApiResponse({ status: 201, description: 'Run status after resuming — COMPLETED or FAILED.' })
  @ApiResponse({ status: 404, description: 'No run found with this runId.' })
  async approveCompliance(
    @Param('runId') runId: string,
    @Body(dtoValidationPipe(ComplianceApprovalDto)) dto: ComplianceApprovalDto,
  ) {
    await this.engine.signalByRunId(runId, {
      gateName: 'compliance-approval',
      payload: { approved: dto.approved, reviewer: dto.reviewer, notes: dto.notes ?? null },
    });
    return this.getRun(runId);
  }

  /**
   * Looks up the latest run for an email address via its `correlationKey`,
   * without needing the `runId`. Registered before the `:runId` route below
   * so Nest/Express doesn't treat the literal `by-email` segment as a `runId`.
   */
  @Get('by-email/:email')
  @ApiOperation({
    summary: "Look up an applicant's latest run by email, without needing the runId",
  })
  @ApiParam({ name: 'email', description: 'The same email the run was started with' })
  @ApiResponse({ status: 200, description: 'The latest run for this email.' })
  @ApiResponse({ status: 404, description: 'No run found for this email.' })
  async getRunByEmail(@Param('email') email: string) {
    const run = await this.storage.getLatestRunByCorrelationKey(
      WORKFLOW_NAME,
      correlationKeyFor(email),
    );
    if (!run) {
      throw new NotFoundException(`No onboarding run found for email "${email}"`);
    }
    return run;
  }

  /** Returns the run's current status plus its full execution journal (redacted). */
  @Get(':runId')
  @ApiOperation({ summary: "Get a run's status and full execution journal" })
  @ApiParam(RUN_ID_PARAM)
  @ApiResponse({ status: 200, description: 'The run and its ordered event journal.' })
  @ApiResponse({ status: 404, description: 'No run found with this runId.' })
  async getRun(@Param('runId') runId: string) {
    const run = await this.storage.getRun(runId);
    if (!run) {
      throw new NotFoundException(`No onboarding run found with id "${runId}"`);
    }
    const events = await this.storage.getEvents(runId);
    return { run, events };
  }
}
