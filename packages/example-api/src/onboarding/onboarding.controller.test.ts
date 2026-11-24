import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';

// Deliberately chosen so the deterministic `runComplianceCheck` hash lands
// below ("low-risk@example.com") and at/above ("alice@example.com") the
// HIGH_RISK_SCORE_THRESHOLD, exercising both branches of the workflow.
const LOW_RISK_EMAIL = 'low-risk@example.com';
const HIGH_RISK_EMAIL = 'alice@example.com';

describe('Onboarding (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('completes straight through for a low-risk applicant (no compliance gate)', async () => {
    const server = app.getHttpServer();

    const started = await request(server)
      .post('/onboarding')
      .send({ email: 'Low-Risk@Example.com', fullName: 'Lee Rowe', dateOfBirth: '1990-01-01' })
      .expect(202);

    const { runId, correlationKey } = started.body as { runId: string; correlationKey: string };
    expect(correlationKey).toBe(`onboarding:${LOW_RISK_EMAIL}`);

    let status = await request(server).get(`/onboarding/${runId}`).expect(200);
    expect(status.body.run.status).toBe('WAITING_ATTESTATION');

    await request(server).post(`/onboarding/${runId}/email-verified`).expect(201);

    status = await request(server).get(`/onboarding/${runId}`).expect(200);
    expect(status.body.run.status).toBe('COMPLETED');
    expect(status.body.run.output).toMatchObject({
      status: 'ACTIVE',
      requiredComplianceReview: false,
    });
    // dateOfBirth is in the module's redactFields, so it must never leak over HTTP.
    expect(status.body.run.input.dateOfBirth).toBe('[REDACTED]');
  });

  it('suspends for compliance approval when the applicant is flagged high-risk', async () => {
    const server = app.getHttpServer();

    const started = await request(server)
      .post('/onboarding')
      .send({ email: HIGH_RISK_EMAIL, fullName: 'Alice Doe', dateOfBirth: '1985-03-14' })
      .expect(202);
    const { runId } = started.body as { runId: string };

    await request(server).post(`/onboarding/${runId}/email-verified`).expect(201);

    const status = await request(server).get(`/onboarding/${runId}`).expect(200);
    expect(status.body.run.status).toBe('WAITING_ATTESTATION');
    const lastEvent = status.body.events.at(-1);
    expect(lastEvent.type).toBe('ATTESTATION_REQUESTED');
    expect(lastEvent.stepName).toBe('compliance-approval');

    const approved = await request(server)
      .post(`/onboarding/${runId}/compliance-approval`)
      .send({ approved: true, reviewer: 'compliance-bot' })
      .expect(201);
    expect(approved.body.run.status).toBe('COMPLETED');
    expect(approved.body.run.output).toMatchObject({ requiredComplianceReview: true });
  });

  it('fails the run when compliance rejects a high-risk applicant', async () => {
    const server = app.getHttpServer();
    const started = await request(server)
      .post('/onboarding')
      .send({ email: HIGH_RISK_EMAIL, fullName: 'Alice Doe', dateOfBirth: '1985-03-14' })
      .expect(202);
    const { runId } = started.body as { runId: string };

    await request(server).post(`/onboarding/${runId}/email-verified`).expect(201);
    const rejected = await request(server)
      .post(`/onboarding/${runId}/compliance-approval`)
      .send({ approved: false, reviewer: 'compliance-bot', notes: 'mismatched documents' })
      .expect(201);

    expect(rejected.body.run.status).toBe('FAILED');
    expect(rejected.body.run.error).toContain('mismatched documents');
  });

  it('reuses the existing run for a duplicate Idempotency-Key', async () => {
    const server = app.getHttpServer();
    const payload = { email: 'idem@example.com', fullName: 'Ivy Demp', dateOfBirth: '1992-02-02' };

    const first = await request(server)
      .post('/onboarding')
      .set('Idempotency-Key', 'idem-key-1')
      .send(payload)
      .expect(202);
    const second = await request(server)
      .post('/onboarding')
      .set('Idempotency-Key', 'idem-key-1')
      .send(payload)
      .expect(202);

    expect(second.body.runId).toBe(first.body.runId);
  });

  it('looks up the latest run by email via the correlationKey route', async () => {
    const server = app.getHttpServer();
    const started = await request(server)
      .post('/onboarding')
      .send({ email: LOW_RISK_EMAIL, fullName: 'Lee Rowe', dateOfBirth: '1990-01-01' })
      .expect(202);
    const { runId } = started.body as { runId: string };

    const byEmail = await request(server).get(`/onboarding/by-email/${LOW_RISK_EMAIL}`).expect(200);
    expect(byEmail.body.id).toBe(runId);
  });

  it('returns 404 for an unknown run id', async () => {
    await request(app.getHttpServer()).get('/onboarding/does-not-exist').expect(404);
  });

  it('rejects invalid payloads with 400', async () => {
    await request(app.getHttpServer())
      .post('/onboarding')
      .send({ email: 'not-an-email', fullName: '', dateOfBirth: 'not-a-date' })
      .expect(400);
  });
});
