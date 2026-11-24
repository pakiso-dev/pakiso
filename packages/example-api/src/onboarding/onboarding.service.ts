import { randomUUID } from 'node:crypto';
import type { CausalContext } from '@causal/core';
import { Recordable, Workflow } from '@causal/nest';
import { Injectable } from '@nestjs/common';

/** Risk scores at or above this threshold require a human compliance sign-off. */
const HIGH_RISK_SCORE_THRESHOLD = 70;

export interface OnboardUserInput {
  email: string;
  fullName: string;
  dateOfBirth: string;
}

export interface OnboardUserOutput {
  userId: string;
  status: 'ACTIVE';
  activatedAt: string;
  /** Whether this run had to pass through the human compliance-approval gate. */
  requiredComplianceReview: boolean;
}

export interface EmailVerifiedSignal {
  verifiedAt?: string;
}

export interface ComplianceApprovalSignal {
  approved: boolean;
  reviewer: string;
  notes?: string | null;
}

/**
 * Implements the `user-onboarding` workflow end to end: create the account,
 * require email verification, run an (automated) compliance/KYC check, and —
 * only when that check flags the applicant as high-risk — suspend for a
 * human compliance officer's sign-off before activating the account.
 *
 * Because every side effect and gate is recorded in the run's execution
 * journal, a crash or process restart between any two steps resumes exactly
 * where it left off: completed steps are never re-run, and pending gates
 * stay durably suspended (`WAITING_ATTESTATION`) until the matching
 * `POST /onboarding/:runId/...` signal arrives.
 */
@Injectable()
export class OnboardingService {
  @Workflow({ name: 'user-onboarding' })
  async onboard(input: OnboardUserInput, ctx: CausalContext): Promise<OnboardUserOutput> {
    const account = await this.createAccount(input);

    await this.sendVerificationEmail({ userId: account.userId, email: account.email });
    await ctx.awaitAttestation<EmailVerifiedSignal>('email-verified');

    // Named explicitly (rather than via `@Recordable()`) to show the manual
    // `ctx.step()` form: useful when the step name needs to differ from the
    // method name, or when the call site isn't itself a provider method.
    const { riskScore } = await ctx.step('run-compliance-check', () =>
      this.runComplianceCheck(input),
    );

    const requiredComplianceReview = riskScore >= HIGH_RISK_SCORE_THRESHOLD;
    if (requiredComplianceReview) {
      const approval = await ctx.awaitAttestation<ComplianceApprovalSignal>('compliance-approval');
      if (!approval.approved) {
        throw new Error(
          `Onboarding rejected by compliance reviewer "${approval.reviewer}": ${approval.notes ?? 'no reason given'}`,
        );
      }
    }

    const { activatedAt } = await this.activateAccount({ userId: account.userId });

    return { userId: account.userId, status: 'ACTIVE', activatedAt, requiredComplianceReview };
  }

  /**
   * `@Recordable()` automatically wraps this call in `ctx.step('createAccount', ...)`
   * whenever it runs inside an active workflow — the simplest way to make an
   * existing service method replay-safe without touching its call sites.
   */
  @Recordable()
  async createAccount(
    input: OnboardUserInput,
  ): Promise<{ userId: string; email: string; createdAt: string }> {
    // Stands in for persisting a new user record in your own domain database.
    return { userId: randomUUID(), email: input.email, createdAt: new Date().toISOString() };
  }

  @Recordable()
  async sendVerificationEmail(params: {
    userId: string;
    email: string;
  }): Promise<{ sent: boolean; to: string }> {
    // Stands in for dispatching a transactional email via your provider of choice.
    return { sent: true, to: params.email };
  }

  /**
   * Stands in for calling a third-party KYC/AML provider. Deliberately
   * deterministic (hashed from the applicant's email) so this example is
   * reproducible: a real integration would call out to an external service,
   * but either way the result is recorded exactly once per run — replay and
   * resume reuse the recorded score rather than re-querying the provider or
   * risking a different score on a later pass.
   */
  async runComplianceCheck(input: OnboardUserInput): Promise<{ riskScore: number }> {
    let hash = 0;
    for (const char of input.email) {
      hash = (hash * 31 + char.charCodeAt(0)) % 100;
    }
    return { riskScore: hash };
  }

  @Recordable()
  async activateAccount(params: { userId: string }): Promise<{
    userId: string;
    activatedAt: string;
  }> {
    return { userId: params.userId, activatedAt: new Date().toISOString() };
  }
}
