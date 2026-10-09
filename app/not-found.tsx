import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-800">404 - Page Not Found</h2>
        <p className="mt-2 text-sm text-slate-600">
          The requested page, catalogue item, or record could not be found.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Return to Portal
        </Link>
      </div>
    </div>
  );
}
