interface ForbiddenCardProps {
  title?: string;
  message: string;
  requiredPermission?: string;
  userRole?: string;
}

export function ForbiddenCard({
  title = "403 Forbidden — Access Denied",
  message,
  requiredPermission,
  userRole,
}: ForbiddenCardProps) {
  return (
    <div className="mx-auto my-12 max-w-xl rounded-xl border border-red-200 bg-white p-8 shadow-sm">
      <div className="flex items-center space-x-3 text-red-600">
        <svg
          aria-hidden="true"
          className="h-7 w-7 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>
      </div>

      <p className="mt-4 text-sm text-slate-700 leading-relaxed">{message}</p>

      {(requiredPermission || userRole) && (
        <div className="mt-4 rounded-lg bg-slate-50 p-4 border border-slate-200 text-xs text-slate-600 space-y-1">
          {requiredPermission && (
            <p>
              <strong className="text-slate-800">Required Permission:</strong>{" "}
              <code className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-red-800">
                {requiredPermission}
              </code>
            </p>
          )}
          {userRole && (
            <p>
              <strong className="text-slate-800">Your Current Role:</strong>{" "}
              <span className="font-semibold text-slate-700">{userRole}</span>
            </p>
          )}
          <p className="pt-2 text-slate-500">
            Per RBMI security policy (FR-AU-02, NFR-S-01), unpermitted operations are rejected
            server-side and logged to the system audit trail.
          </p>
        </div>
      )}

      <div className="mt-6 flex space-x-3">
        <a
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-md bg-blue-900 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-800 transition"
        >
          Return to Dashboard
        </a>
        <a
          href="/"
          className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
        >
          Back to Home
        </a>
      </div>
    </div>
  );
}
