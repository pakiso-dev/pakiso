import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';

const AUTO_APPROVE_AMOUNT_CENTS = 2_500; // below the $100 auto-approve limit
const ESCALATE_AMOUNT_CENTS = 15_000; // at/above the $100 auto-approve limit

describe('RefundAgent (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('auto-approves and issues a small refund straight through (no human-approval gate)', async () => {
    const server = app.getHttpServer();

    const started = await request(server)
      .post('/refund-requests')
      .send({
        ticketId: 'TCK-AUTO-1',
        customerEmail: 'ada@example.com',
        refundAmountCents: AUTO_APPROVE_AMOUNT_CENTS,
        reason: 'Item arrived damaged',
      })
      .expect(202);

    const { runId, correlationKey } = started.body as { runId: string; correlationKey: string };
    expect(correlationKey).toBe('support-refund:TCK-AUTO-1');

    const status = await request(server).get(`/refund-requests/${runId}`).expect(200);
    expect(status.body.run.status).toBe('COMPLETED');
    expect(status.body.run.output).toMatchObject({
      action: 'REFUNDED',
      refundedAmountCents: AUTO_APPROVE_AMOUNT_CENTS,
      requiredHumanApproval: false,
    });
  });

  it('denies a likely-duplicate claim outright, with no gate and no refund issued', async () => {
    const server = app.getHttpServer();

    const started = await request(server)
      .post('/refund-requests')
      .send({
        ticketId: 'TCK-DENY-1',
        customerEmail: 'bo@example.com',
        refundAmountCents: AUTO_APPROVE_AMOUNT_CENTS,
        reason: 'This looks like a duplicate claim of TCK-0999',
      })
      .expect(202);
    const { runId } = started.body as { runId: string };

    const status = await request(server).get(`/refund-requests/${runId}`).expect(200);
    expect(status.body.run.status).toBe('COMPLETED');
    expect(status.body.run.output).toMatchObject({
      action: 'DENIED',
      refundedAmountCents: 0,
      requiredHumanApproval: false,
    });
  });

  it('suspends for human approval when the agent proposes a refund above the limit', async () => {
    const server = app.getHttpServer();

    const started = await request(server)
      .post('/refund-requests')
      .send({
        ticketId: 'TCK-ESCALATE-1',
        customerEmail: 'cleo@example.com',
        refundAmountCents: ESCALATE_AMOUNT_CENTS,
        reason: 'Charged twice for the same order',
      })
      .expect(202);
    const { runId } = started.body as { runId: string };

    const status = await request(server).get(`/refund-requests/${runId}`).expect(200);
    expect(status.body.run.status).toBe('WAITING_ATTESTATION');
    const lastEvent = status.body.events.at(-1);
    expect(lastEvent.type).toBe('ATTESTATION_REQUESTED');
    expect(lastEvent.stepName).toBe('human-approval');

    const approved = await request(server)
      .post(`/refund-requests/${runId}/human-approval`)
      .send({ approved: true, reviewer: 'support-lead-bot' })
      .expect(201);
    expect(approved.body.run.status).toBe('COMPLETED');
    expect(approved.body.run.output).toMatchObject({
      action: 'REFUNDED',
      refundedAmountCents: ESCALATE_AMOUNT_CENTS,
      requiredHumanApproval: true,
    });
  });

  it('fails the run when the support lead rejects an escalated refund', async () => {
    const server = app.getHttpServer();
    const started = await request(server)
      .post('/refund-requests')
      .send({
        ticketId: 'TCK-ESCALATE-2',
        customerEmail: 'dex@example.com',
        refundAmountCents: ESCALATE_AMOUNT_CENTS,
        reason: 'Requesting a refund for an undelivered package',
      })
      .expect(202);
    const { runId } = started.body as { runId: string };

    const rejected = await request(server)
      .post(`/refund-requests/${runId}/human-approval`)
      .send({ approved: false, reviewer: 'support-lead-bot', notes: 'Tracking shows delivered' })
      .expect(201);

    expect(rejected.body.run.status).toBe('FAILED');
    expect(rejected.body.run.error).toContain('Tracking shows delivered');
  });

  it('reuses the existing run for a duplicate Idempotency-Key', async () => {
    const server = app.getHttpServer();
    const payload = {
      ticketId: 'TCK-IDEM-1',
      customerEmail: 'finn@example.com',
      refundAmountCents: AUTO_APPROVE_AMOUNT_CENTS,
      reason: 'Wrong item shipped',
    };

    const first = await request(server)
      .post('/refund-requests')
      .set('Idempotency-Key', 'refund-idem-key-1')
      .send(payload)
      .expect(202);
    const second = await request(server)
      .post('/refund-requests')
      .set('Idempotency-Key', 'refund-idem-key-1')
      .send(payload)
      .expect(202);

    expect(second.body.runId).toBe(first.body.runId);
  });

  it('looks up the latest run by ticketId via the correlationKey route', async () => {
    const server = app.getHttpServer();
    const started = await request(server)
      .post('/refund-requests')
      .send({
        ticketId: 'TCK-LOOKUP-1',
        customerEmail: 'gil@example.com',
        refundAmountCents: AUTO_APPROVE_AMOUNT_CENTS,
        reason: 'Item never arrived',
      })
      .expect(202);
    const { runId } = started.body as { runId: string };

    const byTicket = await request(server)
      .get('/refund-requests/by-ticket/TCK-LOOKUP-1')
      .expect(200);
    expect(byTicket.body.id).toBe(runId);
  });

  it('returns 404 for an unknown run id', async () => {
    await request(app.getHttpServer()).get('/refund-requests/does-not-exist').expect(404);
  });

  it('rejects invalid payloads with 400', async () => {
    await request(app.getHttpServer())
      .post('/refund-requests')
      .send({ ticketId: '', customerEmail: 'not-an-email', refundAmountCents: -1, reason: '' })
      .expect(400);
  });
});
