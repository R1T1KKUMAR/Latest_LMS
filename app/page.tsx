import Link from "next/link";
import { PublicFooter, PublicHeader } from "@/components/layout/PublicHeader";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader currentPath="/" />

      <main className="flex-1 mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-10 w-full">
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-8 shadow-xs">
          <div className="max-w-2xl">
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              RBMI Campus LAN Portal
            </span>
            <h2 className="mt-2.5 sm:mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              RBMI Library Management System
            </h2>
            <p className="mt-2 sm:mt-3 text-sm sm:text-base leading-relaxed text-slate-600">
              Welcome to the centralized library portal serving the engineering, management,
              pharmacy, and nursing colleges of the RBMI Group of Institutions, Bareilly.
            </p>
          </div>

          <div className="mt-6 sm:mt-8 grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 sm:p-6">
              <h3 className="text-base font-semibold text-slate-900">Public OPAC</h3>
              <p className="mt-2 text-sm text-slate-600">
                Browse the library catalogue, search textbooks and journals, check real-time
                availability, and reserve titles.
              </p>
              <div className="mt-4">
                <Link
                  href="/opac"
                  className="inline-flex items-center text-sm font-semibold text-blue-700 hover:text-blue-800"
                >
                  Open OPAC &rarr;
                </Link>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 sm:p-6">
              <h3 className="text-base font-semibold text-slate-900">Staff Circulation Desk</h3>
              <p className="mt-2 text-sm text-slate-600">
                Librarian workspace for barcode-driven checkouts, returns, renewals, fines, and
                roster management.
              </p>
              <div className="mt-4">
                <Link
                  href="/login"
                  className="inline-flex items-center text-sm font-semibold text-blue-700 hover:text-blue-800"
                >
                  Staff Login &rarr;
                </Link>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 sm:p-6">
              <h3 className="text-base font-semibold text-slate-900">System Status</h3>
              <p className="mt-2 text-sm text-slate-600">
                Check server readiness, runtime diagnostics, and application service availability.
              </p>
              <div className="mt-4">
                <Link
                  href="/health"
                  className="inline-flex items-center text-sm font-semibold text-blue-700 hover:text-blue-800"
                >
                  Health Check &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
