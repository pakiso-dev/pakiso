import { Injectable } from '@nestjs/common';
import type { PakisoContext } from '@pakiso/core';
import { Recordable, Workflow } from '@pakiso/nest';

/** Refunds at or above this amount require a human support-lead sign-off. */
const AUTO_APPROVE_LIMIT_CENTS = 10_000; // $100.00

/** Reasons containing this (case-insensitive) are denied outright by the agent, no tool call made. */
const AUTO_DENY_KEYWORD = 'duplicate';

export interface RefundRequestInput {
  ticketId: string;
  customerEmail: string;
  refundAmountCents: number;
  reason: string;
}

export interface RefundRequestOutput {
  ticketId: string;
  action: 'DENIED' | 'REFUNDED';
  refundedAmountCents: number;
  /** Whether this run had to pass through the human support-lead approval gate. */
  requiredHumanApproval: boolean;
  decidedAt: string;
}

export interface HumanApprovalSignal {
  approved: boolean;
  reviewer: string;
  notes?: string | null;
}

interface AgentDecision {
  action: 'DENY' | 'REFUND';
  rationale: string;
}

/**
 * Implements the `support-refund-agent` workflow: an LLM-driven support
 * agent proposes an action for a refund request, and — only when that
 * action is to actually move money above `AUTO_APPROVE_LIMIT_CENTS` — the
 * run suspends for a human support lead's sign-off *before* the refund tool
 * call executes.
 *
 * This is the same durable-execution/attestation-gate machinery as the
 * `user-onboarding` workflow (see `../onboarding`), applied to a different
 * shape of problem: pairing an autonomous, non-deterministic agent "brain"
 * (an LLM call, stood in here by `classifyWithAgent()`) with a
 * deterministic, replay-safe record of what it decided and what it did
 * about it. Because the agent's tool call (`issueRefund`) is wrapped in a
 * step, a crash between "human approved" and "refund issued" resumes by
 * re-emitting the already-journaled refund result rather than charging the
 * customer's account twice.
 */
@Injectable()
export class RefundAgentService {
  @Workflow({ name: 'support-refund-agent' })
  async handleRefundRequest(
    input: RefundRequestInput,
    ctx: PakisoContext,
  ): Promise<RefundRequestOutput> {
    const decision = await ctx.step('classify-with-agent', () => this.classifyWithAgent(input));

    if (decision.action === 'DENY') {
      const { decidedAt } = await this.recordDenial({ ticketId: input.ticketId, decision });
      return {
        ticketId: input.ticketId,
        action: 'DENIED',
        refundedAmountCents: 0,
        requiredHumanApproval: false,
        decidedAt,
      };
    }

    const requiredHumanApproval = input.refundAmountCents >= AUTO_APPROVE_LIMIT_CENTS;
    if (requiredHumanApproval) {
      const approval = await ctx.awaitAttestation<HumanApprovalSignal>('human-approval');
      if (!approval.approved) {
        throw new Error(
          `Refund rejected by support lead "${approval.reviewer}": ${approval.notes ?? 'no reason given'}`,
        );
      }
    }

    const { refundedAmountCents, issuedAt } = await this.issueRefund({
      ticketId: input.ticketId,
      amountCents: input.refundAmountCents,
    });

    return {
      ticketId: input.ticketId,
      action: 'REFUNDED',
      refundedAmountCents,
      requiredHumanApproval,
      decidedAt: issuedAt,
    };
  }

  /**
   * Stands in for an LLM/agent call that reads the ticket and proposes an
   * action. Deliberately a pure function of the input (rather than a real
   * model call) so this example is reproducible without an API key — in a
   * real integration this would call out to your model/agent framework of
   * choice, but either way the result is recorded exactly once per run:
   * replay and resume reuse the recorded decision rather than re-prompting
   * the model or risking a different decision on a later pass.
   */
  async classifyWithAgent(input: RefundRequestInput): Promise<AgentDecision> {
    if (input.reason.toLowerCase().includes(AUTO_DENY_KEYWORD)) {
      return {
        action: 'DENY',
        rationale: `Reason flagged as a likely duplicate claim: "${input.reason}"`,
      };
    }
    return { action: 'REFUND', rationale: `Refund request appears legitimate: "${input.reason}"` };
  }

  @Recordable()
  async recordDenial(params: {
    ticketId: string;
    decision: AgentDecision;
  }): Promise<{ decidedAt: string }> {
    // Stands in for closing the support ticket with the agent's rationale.
    return { decidedAt: new Date().toISOString() };
  }

  /**
   * The agent's actual tool call: stands in for calling a payments provider
   * to move money. This is the irreversible side effect the human-approval
   * gate protects above `AUTO_APPROVE_LIMIT_CENTS` — wrapping it in
   * `@Recordable()` means it fires exactly once per run even if the process
   * crashes immediately after the refund succeeds but before the response
   * is returned.
   */
  @Recordable()
  async issueRefund(params: {
    ticketId: string;
    amountCents: number;
  }): Promise<{ refundedAmountCents: number; issuedAt: string }> {
    return { refundedAmountCents: params.amountCents, issuedAt: new Date().toISOString() };
  }
}
