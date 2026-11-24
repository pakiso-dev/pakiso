import { StatusBadge } from '../components/StatusBadge.js';
import type { CausalRunRecord, CausalRunStatus, ListRunsFilter } from '../types.js';

const STATUS_FILTER_OPTIONS: Array<CausalRunStatus | ''> = [
  '',
  'PENDING',
  'RUNNING',
  'WAITING_ATTESTATION',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function buildQuery(filter: ListRunsFilter, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (filter.workflowName) params.set('workflowName', filter.workflowName);
  if (filter.status) params.set('status', filter.status);
  for (const [key, value] of Object.entries(extra ?? {})) {
    params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

const inputClasses =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-xs placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none sm:w-56';

export interface RunListPageProps {
  runs: CausalRunRecord[];
  nextCursor: string | null;
  filter: ListRunsFilter;
  unsupported?: boolean;
  /** Omitted during SSR; provided by the client after hydration for fast in-page navigation. */
  onNavigateToDetail?: (runId: string) => void;
  onFilterSubmit?: (filter: ListRunsFilter) => void;
  onNextPage?: (cursor: string) => void;
}

export function RunListPage({
  runs,
  nextCursor,
  filter,
  unsupported,
  onNavigateToDetail,
  onFilterSubmit,
  onNextPage,
}: RunListPageProps) {
  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Runs</h1>
          <p className="mt-1 text-sm text-gray-500">
            Browse workflow runs and drill into their full event journal.
          </p>
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          action="/causal-dashboard"
          method="get"
          onSubmit={(event) => {
            if (!onFilterSubmit) return;
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            onFilterSubmit({
              workflowName: String(data.get('workflowName') ?? '') || undefined,
              status: (String(data.get('status') ?? '') || undefined) as
                | CausalRunStatus
                | undefined,
            });
          }}
        >
          <input
            name="workflowName"
            placeholder="Filter by workflow name"
            defaultValue={filter.workflowName ?? ''}
            className={inputClasses}
          />
          <select
            name="status"
            defaultValue={filter.status ?? ''}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option || 'all'} value={option}>
                {option ? option.replaceAll('_', ' ') : 'All statuses'}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-indigo-500"
          >
            Filter
          </button>
        </form>
      </div>

      {unsupported ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          The configured storage adapter doesn't implement{' '}
          <code className="font-mono">listRuns()</code>, so run browsing is unavailable. See the
          @causal/dashboard docs for implementing it on a custom adapter.
        </div>
      ) : runs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white py-16 text-center">
          <p className="text-sm font-medium text-gray-900">No runs found</p>
          <p className="mt-1 text-sm text-gray-500">Try a different workflow name or status.</p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xs">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">Workflow</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">Run ID</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">
                    Correlation key
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-700">{run.workflowName}</td>
                    <td className="px-4 py-3">
                      <a
                        href={`/causal-dashboard/runs/${run.id}`}
                        onClick={(event) => {
                          if (!onNavigateToDetail) return;
                          event.preventDefault();
                          onNavigateToDetail(run.id);
                        }}
                        title={run.id}
                        className="font-mono text-xs whitespace-nowrap text-indigo-600 hover:text-indigo-800 hover:underline"
                      >
                        {run.id.slice(0, 8)}&hellip;
                      </a>
                    </td>
                    <td
                      className="max-w-48 truncate px-4 py-3 text-gray-500"
                      title={run.correlationKey ?? undefined}
                    >
                      {run.correlationKey ?? '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {formatDate(run.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {nextCursor !== null && (
            <div className="mt-4 flex justify-end">
              <a
                href={`/causal-dashboard${buildQuery(filter, { cursor: nextCursor })}`}
                onClick={(event) => {
                  if (!onNextPage) return;
                  event.preventDefault();
                  onNextPage(nextCursor);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50"
              >
                Next <span aria-hidden="true">&rarr;</span>
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
