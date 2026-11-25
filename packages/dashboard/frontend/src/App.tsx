import { useEffect, useState } from 'react';
import { fetchDetailPage, fetchListPage } from './client-api.js';
import { Layout } from './components/Layout.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { RunDetailPage } from './pages/RunDetailPage.js';
import { RunListPage } from './pages/RunListPage.js';
import type { ListRunsFilter, PageData } from './types.js';

/**
 * Single isomorphic React tree rendered both by `entry-server.tsx`
 * (`renderToString`, for the initial SSR'd HTML) and `entry-client.tsx`
 * (`hydrateRoot`, attaching interactivity to that same markup). `useEffect`
 * and the navigation handlers below only ever run client-side — React's
 * `renderToString` doesn't execute effects, and nothing invokes them during
 * server rendering — so referencing browser-only globals (`window`,
 * `fetch`) inside them is safe even though this component also runs in
 * Node.
 */
export function DashboardApp({ initialPage }: { initialPage: PageData }) {
  const [page, setPage] = useState<PageData>(initialPage);
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    function onPopState(): void {
      void loadFromLocation(setPage, setIsNavigating);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function navigateToList(filter: ListRunsFilter, cursor?: string): void {
    void (async () => {
      setIsNavigating(true);
      try {
        const nextPage = await fetchListPage({ ...filter, ...(cursor ? { cursor } : {}) });
        setPage(nextPage);
        window.history.pushState(null, '', buildListUrl(filter, cursor));
      } finally {
        setIsNavigating(false);
      }
    })();
  }

  function navigateToDetail(runId: string): void {
    void (async () => {
      setIsNavigating(true);
      try {
        const nextPage = await fetchDetailPage(runId);
        setPage(nextPage);
        window.history.pushState(null, '', `/pakiso-dashboard/runs/${runId}`);
      } finally {
        setIsNavigating(false);
      }
    })();
  }

  return (
    <Layout isNavigating={isNavigating} onNavigateHome={() => navigateToList({})}>
      <PageContent
        page={page}
        onNavigateToList={navigateToList}
        onNavigateToDetail={navigateToDetail}
      />
    </Layout>
  );
}

function PageContent({
  page,
  onNavigateToList,
  onNavigateToDetail,
}: {
  page: PageData;
  onNavigateToList: (filter: ListRunsFilter, cursor?: string) => void;
  onNavigateToDetail: (runId: string) => void;
}) {
  switch (page.type) {
    case 'list':
      return (
        <RunListPage
          runs={page.runs}
          nextCursor={page.nextCursor}
          filter={page.filter}
          unsupported={page.unsupported}
          onNavigateToDetail={onNavigateToDetail}
          onFilterSubmit={(filter) => onNavigateToList(filter)}
          onNextPage={(cursor) => onNavigateToList(page.filter, cursor)}
        />
      );
    case 'detail':
      return (
        <RunDetailPage
          run={page.run}
          events={page.events}
          onNavigateToList={() => onNavigateToList({})}
        />
      );
    case 'not-found':
      return <NotFoundPage runId={page.runId} onNavigateToList={() => onNavigateToList({})} />;
  }
}

function buildListUrl(filter: ListRunsFilter, cursor?: string): string {
  const params = new URLSearchParams();
  if (filter.workflowName) params.set('workflowName', filter.workflowName);
  if (filter.status) params.set('status', filter.status);
  if (cursor) params.set('cursor', cursor);
  const query = params.toString();
  return `/pakiso-dashboard${query ? `?${query}` : ''}`;
}

async function loadFromLocation(
  setPage: (page: PageData) => void,
  setIsNavigating: (navigating: boolean) => void,
): Promise<void> {
  setIsNavigating(true);
  try {
    const runMatch = window.location.pathname.match(/\/pakiso-dashboard\/runs\/(.+)$/);
    if (runMatch?.[1]) {
      setPage(await fetchDetailPage(decodeURIComponent(runMatch[1])));
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setPage(
      await fetchListPage({
        workflowName: params.get('workflowName') ?? undefined,
        status: (params.get('status') as ListRunsFilter['status']) ?? undefined,
        cursor: params.get('cursor') ?? undefined,
      }),
    );
  } finally {
    setIsNavigating(false);
  }
}
