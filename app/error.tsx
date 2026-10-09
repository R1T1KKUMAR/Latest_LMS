"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Technical errors are logged server-side; avoid leaking stack traces to clients
    console.error("Runtime UI error:", error.message);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md rounded-lg border border-red-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-red-600">Application Error</h2>
        <p className="mt-2 text-sm text-slate-600">
          An unexpected error occurred while processing your request. Please try again or contact
          the library desk.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
