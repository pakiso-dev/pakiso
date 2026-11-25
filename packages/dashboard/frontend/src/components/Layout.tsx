import type { ReactNode } from 'react';
import pakisoMark from '../assets/pakiso-mark.png';

export function Layout({
  children,
  isNavigating,
  onNavigateHome,
}: {
  children: ReactNode;
  isNavigating?: boolean;
  onNavigateHome?: () => void;
}) {
  return (
    <div className="min-h-screen">
      {isNavigating && (
        <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-indigo-100">
          <div className="h-full w-1/3 animate-[loading-bar_1s_ease-in-out_infinite] bg-indigo-600" />
        </div>
      )}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-6 py-4">
          <a
            href="/pakiso-dashboard"
            onClick={(event) => {
              if (!onNavigateHome) return;
              event.preventDefault();
              onNavigateHome();
            }}
            className="flex items-center gap-2 text-lg font-semibold text-gray-900 hover:text-indigo-600"
          >
            <img src={pakisoMark} alt="" className="h-6 w-6" />
            Pakiso Dashboard
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
