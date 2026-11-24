import type { CausalRunStatus } from '../types.js';

const STATUS_STYLES: Record<CausalRunStatus, string> = {
  PENDING: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  RUNNING: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  WAITING_ATTESTATION: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  COMPLETED: 'bg-green-50 text-green-700 ring-green-600/20',
  FAILED: 'bg-red-50 text-red-700 ring-red-600/20',
  CANCELLED: 'bg-gray-100 text-gray-600 ring-gray-500/10',
};

export function StatusBadge({ status }: { status: CausalRunStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {status.replaceAll('_', ' ')}
    </span>
  );
}
