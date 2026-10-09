interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({ message = "Loading data...", className = "" }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center p-12 text-center ${className}`}
    >
      <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-900 border-t-transparent" />
      <p className="mt-3 text-xs font-medium text-slate-600">{message}</p>
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="w-full animate-pulse rounded-lg border border-slate-200 bg-white">
      <div className="h-10 border-b border-slate-200 bg-slate-50" />
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, rIdx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no unique data
          <div key={rIdx} className="flex space-x-4 p-4">
            {Array.from({ length: columns }).map((_, cIdx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton columns have no unique data
              <div key={cIdx} className="h-4 flex-1 rounded bg-slate-200" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
