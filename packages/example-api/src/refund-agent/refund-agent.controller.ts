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
import { CreateRefundRequestDto } from './dto/create-refund-request.dto.js';
import { HumanApprovalDto } from './dto/human-approval.dto.js';

const WORKFLOW_NAME = 'support-refund-agent';
const RUN_ID_PARAM = { name: 'runId', description: 'Run id returned from POST /refund-requests' };

function correlationKeyFor(ticketId: string): string {
  return `support-refund:${ticketId}`;
}

/**
 * REST control plane for the `support-refund-agent` workflow: an LLM-driven
 * agent proposes an action for a refund request, and a human support lead
 * is asked to sign off *before* the agent's refund tool call executes,
 * whenever the proposed refund is large enough to warrant it. Mirrors the
 * same `@pakiso/nest` ergonomics as `OnboardingController` (idempotent
 * starts, signaling suspended gates by `runId`, response redaction) applied
 * to an agent/tool-call shape of workflow instead of a human-only one.
 */
@ApiTags('refund-agent')
@Controller('refund-requests')
@UseInterceptors(RedactResponseInterceptor)
export class RefundAgentController {
  constructor(
    @Inject(PAKISO_ENGINE) private readonly engine: PakisoEngine,
    @Inject(PAKISO_STORAGE_ADAPTER) private readonly storage: PakisoStorageAdapter,
  ) {}

  /** Starts a new refund-request run. */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Submit a refund request for the agent to evaluate',
    description:
      'The agent denies likely-duplicate claims outright, auto-approves small refunds, ' +
      'and suspends awaiting the human-approval gate before issuing larger refunds. ' +
      'Reusing the same Idempotency-Key returns the existing run instead of starting a new one.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Dedupes retried starts against the same run.',
  })
  @ApiBody({ type: CreateRefundRequestDto })
  @ApiResponse({ status: 202, description: 'Run created (or found, if Idempotency-Key matched).' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  async start(
    @Body(dtoValidationPipe(CreateRefundRequestDto)) dto: CreateRefundRequestDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const correlationKey = correlationKeyFor(dto.ticketId);
    const idempotencyKey = readIdempotencyKey(headers);

    const run = await this.engine.startWorkflow({
      workflowName: WORKFLOW_NAME,
      input: {
        ticketId: dto.ticketId,
        customerEmail: dto.customerEmail,
        refundAmountCents: dto.refundAmountCents,
        reason: dto.reason,
      },
      correlationKey,
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
    });

    return { runId: run.id, status: run.status, correlationKey };
  }

  /** Signals the `human-approval` attestation gate (e.g. a support lead reviewing in a dashboard). */
  @Post(':runId/human-approval')
  @ApiOperation({
    summary: 'Signal the human-approval attestation gate',
    description: 'Only ever awaited for refunds the agent proposes above the auto-approve limit.',
  })
  @ApiParam(RUN_ID_PARAM)
  @ApiBody({ type: HumanApprovalDto })
  @ApiResponse({ status: 201, description: 'Run status after resuming — COMPLETED or FAILED.' })
  @ApiResponse({ status: 404, description: 'No run found with this runId.' })
  async approveRefund(
    @Param('runId') runId: string,
    @Body(dtoValidationPipe(HumanApprovalDto)) dto: HumanApprovalDto,
  ) {
    await this.engine.signalByRunId(runId, {
      gateName: 'human-approval',
      payload: { approved: dto.approved, reviewer: dto.reviewer, notes: dto.notes ?? null },
    });
    return this.getRun(runId);
  }

  /**
   * Looks up the latest run for a support ticket via its `correlationKey`,
   * without needing the `runId`. Registered before the `:runId` route below
   * so Nest/Express doesn't treat the literal `by-ticket` segment as a `runId`.
   */
  @Get('by-ticket/:ticketId')
  @ApiOperation({
    summary: "Look up a ticket's latest refund-request run by ticketId, without needing the runId",
  })
  @ApiParam({ name: 'ticketId', description: 'The same ticketId the run was started with' })
  @ApiResponse({ status: 200, description: 'The latest run for this ticket.' })
  @ApiResponse({ status: 404, description: 'No run found for this ticket.' })
  async getRunByTicket(@Param('ticketId') ticketId: string) {
    const run = await this.storage.getLatestRunByCorrelationKey(
      WORKFLOW_NAME,
      correlationKeyFor(ticketId),
    );
    if (!run) {
      throw new NotFoundException(`No refund-request run found for ticket "${ticketId}"`);
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
      throw new NotFoundException(`No refund-request run found with id "${runId}"`);
    }
    const events = await this.storage.getEvents(runId);
    return { run, events };
  }
}
