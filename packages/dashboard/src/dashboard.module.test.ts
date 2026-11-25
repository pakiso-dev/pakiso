import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryStorageAdapter } from '@pakiso/core';
import { PakisoModule } from '@pakiso/nest';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PakisoDashboardModule } from './dashboard.module.js';

describe('PakisoDashboardModule (e2e)', () => {
  let app: INestApplication;
  let storage: InMemoryStorageAdapter;

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    const moduleRef = await Test.createTestingModule({
      imports: [PakisoModule.forRoot({ storage }), PakisoDashboardModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('server-renders the dashboard run list page at the mount path, with real data embedded', async () => {
    const { run } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });

    const response = await request(app.getHttpServer()).get('/pakiso-dashboard').expect(200);

    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('<div id="app">');
    expect(response.text).toContain(run.id);
    expect(response.text).toContain('__PAKISO_DASHBOARD_DATA__');
  });

  it('server-renders a run detail page at /pakiso-dashboard/runs/:id', async () => {
    const { run } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });
    await storage.appendEvent({
      runId: run.id,
      expectedSeq: 0,
      type: 'WORKFLOW_STARTED',
      payload: {},
    });

    const response = await request(app.getHttpServer())
      .get(`/pakiso-dashboard/runs/${run.id}`)
      .expect(200);

    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain(run.id);
    expect(response.text).toContain('WORKFLOW_STARTED');
  });

  it('serves a bundled static asset', async () => {
    const response = await request(app.getHttpServer())
      .get('/pakiso-dashboard/assets/main.js')
      .expect(200);

    expect(response.headers['content-type']).toContain('text/javascript');
  });

  it('lists runs and returns a run detail through the JSON API, reflecting the live engine state', async () => {
    const { run } = await storage.createOrGetRun({ workflowName: 'wf', input: { a: 1 } });
    await storage.appendEvent({
      runId: run.id,
      expectedSeq: 0,
      type: 'WORKFLOW_STARTED',
      payload: {},
    });

    const list = await request(app.getHttpServer()).get('/pakiso-dashboard/api/runs').expect(200);
    expect(list.body.runs.map((r: { id: string }) => r.id)).toEqual([run.id]);

    const detail = await request(app.getHttpServer())
      .get(`/pakiso-dashboard/api/runs/${run.id}`)
      .expect(200);
    expect(detail.body.run.id).toBe(run.id);
    expect(detail.body.events).toHaveLength(1);
  });

  it('returns 404 for an unknown run id', async () => {
    await request(app.getHttpServer()).get('/pakiso-dashboard/api/runs/does-not-exist').expect(404);
  });
});
