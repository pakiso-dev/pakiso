export interface NotFoundPageProps {
  runId: string;
  onNavigateToList?: () => void;
}

export function NotFoundPage({ runId, onNavigateToList }: NotFoundPageProps) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white py-16 text-center">
      <p className="text-sm font-medium text-gray-900">No run found</p>
      <p className="mt-1 font-mono text-sm text-gray-500">{runId}</p>
      <a
        href="/pakiso-dashboard"
        onClick={(event) => {
          if (!onNavigateToList) return;
          event.preventDefault();
          onNavigateToList();
        }}
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
      >
        <span aria-hidden="true">&larr;</span> Back to runs
      </a>
    </div>
  );
}
