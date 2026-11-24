import { Fragment, useState } from 'react';
import type { CausalEventRecord } from '../types.js';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

const EVENT_TYPE_STYLES: Record<string, string> = {
  WORKFLOW_STARTED: 'bg-blue-50 text-blue-700',
  STEP_COMPLETED: 'bg-gray-100 text-gray-700',
  ATTESTATION_REQUESTED: 'bg-amber-50 text-amber-700',
  ATTESTATION_RECEIVED: 'bg-amber-50 text-amber-700',
  WORKFLOW_COMPLETED: 'bg-green-50 text-green-700',
  WORKFLOW_FAILED: 'bg-red-50 text-red-700',
  WORKFLOW_CANCELLED: 'bg-gray-100 text-gray-600',
};

function EventTypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${EVENT_TYPE_STYLES[type] ?? 'bg-gray-100 text-gray-700'}`}
    >
      {type}
    </span>
  );
}

export function JournalTable({ events }: { events: CausalEventRecord[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xs">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium text-gray-500">Seq</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-500">Type</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-500">Step/gate</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-500">Duration</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-500">Created</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-500" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {events.map((event) => {
            const isExpanded = expandedId === event.id;
            return (
              <Fragment key={event.id}>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-500">{event.seq}</td>
                  <td className="px-4 py-2.5">
                    <EventTypeBadge type={event.type} />
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700">
                    {event.stepName ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {event.durationMs !== null ? `${event.durationMs}ms` : '—'}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-500">
                    {formatDate(event.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : event.id)}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      {isExpanded ? 'Hide payload' : 'View payload'}
                    </button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={6} className="bg-gray-50 px-4 py-3">
                      <pre className="max-h-72 overflow-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
