import type { PakisoStorageAdapter } from '@pakiso/core';
import { InMemoryStorageAdapter } from '@pakiso/core';
import { describe, expect, it } from 'vitest';
import { DashboardPagesController } from './dashboard-pages.controller.js';

// Requires the UI build (`pnpm build:ui`, wired as `pretest`) to have already
// populated dist/ssr with the real built SSR render function.
describe('DashboardPagesController', () => {
  it('server-renders the run list page with real run data embedded in the markup', async () => {
    const storage = new InMemoryStorageAdapter();
    const { run } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });
    const controller = new DashboardPagesController(storage);

    const html = await controller.list({});

    expect(html).toContain('<!doctype html>');
    expect(html).toContain(run.id);
    expect(html).toContain('wf');
    // The initial page data is embedded for hydration, not re-fetched client-side.
    expect(html).toContain('__PAKISO_DASHBOARD_DATA__');
    expect(html).toContain('"type":"list"');
  });

  it('filters the server-rendered list by workflowName/status query params', async () => {
    const storage = new InMemoryStorageAdapter();
    const { run: matching } = await storage.createOrGetRun({ workflowName: 'wf-a', input: {} });
    const { run: other } = await storage.createOrGetRun({ workflowName: 'wf-b', input: {} });
    const controller = new DashboardPagesController(storage);

    const html = await controller.list({ workflowName: 'wf-a' });

    expect(html).toContain(matching.id);
    expect(html).not.toContain(other.id);
  });

  it('renders an in-page message (not a thrown error) when listRuns is unsupported', async () => {
    const storageWithoutListRuns: PakisoStorageAdapter = {
      async createOrGetRun() {
        throw new Error('not used in this test');
      },
      async getRun() {
        return null;
      },
      async getLatestRunByCorrelationKey() {
        return null;
      },
      async getEvents() {
        return [];
      },
      async appendEvent() {
        throw new Error('not used in this test');
      },
      async updateRunStatus() {
        throw new Error('not used in this test');
      },
    };
    const controller = new DashboardPagesController(storageWithoutListRuns);

    const html = await controller.list({});

    expect(html).toContain('doesn&#x27;t implement');
    expect(html).toContain('"unsupported":true');
  });

  it('server-renders a run detail page with its full event journal', async () => {
    const storage = new InMemoryStorageAdapter();
    const { run } = await storage.createOrGetRun({ workflowName: 'wf', input: {} });
    await storage.appendEvent({
      runId: run.id,
      expectedSeq: 0,
      type: 'WORKFLOW_STARTED',
      payload: {},
    });
    const controller = new DashboardPagesController(storage);

    const html = await controller.detail(run.id);

    expect(html).toContain(run.id);
    expect(html).toContain('WORKFLOW_STARTED');
    expect(html).toContain('"type":"detail"');
  });

  it('server-renders a not-found page for an unknown run id', async () => {
    const storage = new InMemoryStorageAdapter();
    const controller = new DashboardPagesController(storage);

    const html = await controller.detail('does-not-exist');

    expect(html).toContain('No run found');
    expect(html).toContain('"type":"not-found"');
  });
});
