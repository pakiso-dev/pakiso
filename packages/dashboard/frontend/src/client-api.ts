import type { ListRunsFilter, PageData, PakisoEventRecord, PakisoRunRecord } from './types.js';

/**
 * Fetch helpers used only for client-side navigation after hydration (the
 * initial page load is always server-rendered directly from the storage
 * adapter — see `DashboardPagesController` — so these hit the separate JSON
 * API, `DashboardRunsController`, instead).
 */
const API_BASE = '/pakiso-dashboard/api';

interface ListRunsApiResult {
  runs: PakisoRunRecord[];
  nextCursor: string | null;
}

interface RunDetailApiResult {
  run: PakisoRunRecord;
  events: PakisoEventRecord[];
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = (body as { message?: string } | null)?.message ?? response.statusText;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function fetchListPage(
  filter: ListRunsFilter & { cursor?: string },
): Promise<PageData> {
  const params = new URLSearchParams();
  if (filter.workflowName) params.set('workflowName', filter.workflowName);
  if (filter.status) params.set('status', filter.status);
  if (filter.cursor) params.set('cursor', filter.cursor);
  const query = params.toString();

  const response = await fetch(`${API_BASE}/runs${query ? `?${query}` : ''}`);
  const result = await parseJsonOrThrow<ListRunsApiResult>(response);
  return {
    type: 'list',
    runs: result.runs,
    nextCursor: result.nextCursor,
    filter: {
      ...(filter.workflowName ? { workflowName: filter.workflowName } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
  };
}

export async function fetchDetailPage(runId: string): Promise<PageData> {
  const response = await fetch(`${API_BASE}/runs/${encodeURIComponent(runId)}`);
  if (response.status === 404) {
    return { type: 'not-found', runId };
  }
  const result = await parseJsonOrThrow<RunDetailApiResult>(response);
  return { type: 'detail', run: result.run, events: result.events };
}
