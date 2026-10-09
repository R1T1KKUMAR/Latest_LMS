import Link from "next/link";

interface PublicHeaderProps {
  currentPath?: string;
}

export function PublicHeader({ currentPath }: PublicHeaderProps) {
  return (
    <header className="no-print border-b border-slate-200 bg-white shadow-xs">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center space-x-3">
          <Link href="/" className="flex items-center space-x-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-900 text-sm font-bold text-white shadow-xs">
              LMS
            </span>
            <div>
              <h1 className="text-base font-bold leading-tight text-slate-900">
                RBMI Central Library
              </h1>
              <p className="text-[11px] text-slate-500">RBMI Group of Institutions, Bareilly</p>
            </div>
          </Link>
        </div>
        <nav className="flex items-center space-x-4 text-xs font-medium">
          <Link
            href="/opac"
            className={`transition ${currentPath === "/opac" ? "font-bold text-blue-900" : "text-slate-600 hover:text-blue-700"}`}
          >
            OPAC Catalogue
          </Link>
          <Link
            href="/account"
            className={`transition ${currentPath === "/account" ? "font-bold text-blue-900" : "text-slate-600 hover:text-blue-700"}`}
          >
            Patron Account
          </Link>
          <Link
            href="/health"
            className={`transition ${currentPath === "/health" ? "font-bold text-blue-900" : "text-slate-600 hover:text-blue-700"}`}
          >
            System Status
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-blue-900 px-3 py-1.5 font-semibold text-white transition hover:bg-blue-800 shadow-xs"
          >
            Sign In
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="no-print border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        RBMI Group of Institutions, Bareilly &bull; Library Management System v1.0 &bull; Session
        2026-27
      </div>
    </footer>
  );
}
