import type { ReactNode } from 'react';
import { JournalTable } from '../components/JournalTable.js';
import { StatusBadge } from '../components/StatusBadge.js';
import type { PakisoEventRecord, PakisoRunRecord } from '../types.js';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function MetaField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

export interface RunDetailPageProps {
  run: PakisoRunRecord;
  events: PakisoEventRecord[];
  /** Omitted during SSR; provided by the client after hydration. */
  onNavigateToList?: () => void;
}

export function RunDetailPage({ run, events, onNavigateToList }: RunDetailPageProps) {
  return (
    <div>
      <a
        href="/pakiso-dashboard"
        onClick={(event) => {
          if (!onNavigateToList) return;
          event.preventDefault();
          onNavigateToList();
        }}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-indigo-600"
      >
        <span aria-hidden="true">&larr;</span> Back to runs
      </a>

      <h1 className="mb-4 font-mono text-lg font-semibold break-all text-gray-900">{run.id}</h1>

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-xs">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
          <MetaField label="Workflow">{run.workflowName}</MetaField>
          <MetaField label="Status">
            <StatusBadge status={run.status} />
          </MetaField>
          <MetaField label="Correlation key">{run.correlationKey ?? '—'}</MetaField>
          <MetaField label="Created">{formatDate(run.createdAt)}</MetaField>
          <MetaField label="Updated">{formatDate(run.updatedAt)}</MetaField>
        </dl>
        {run.error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {run.error}
          </div>
        )}
      </div>

      <h2 className="mb-3 text-sm font-semibold text-gray-900">
        Event journal <span className="font-normal text-gray-400">({events.length})</span>
      </h2>
      <JournalTable events={events} />
    </div>
  );
}
