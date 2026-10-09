"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
        <div className="max-w-md rounded-lg border border-red-300 bg-white p-6 shadow-md">
          <h1 className="text-2xl font-bold text-red-600">Critical Error</h1>
          <p className="mt-2 text-sm text-slate-700">
            A critical server or application error occurred.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-4 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Reload System
          </button>
        </div>
      </body>
    </html>
  );
}
