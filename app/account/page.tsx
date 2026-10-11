import { PublicFooter, PublicHeader } from "@/components/layout/PublicHeader";
import { getCurrentSession } from "@/lib/auth";
import { processExpiredHolds } from "@/services/holds";
import { getPatronAccountData } from "@/services/opac";
import { AccountClient } from "./AccountClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Account — RBMI Central Library",
  description: "View active book loans, title holds, fine statements, and borrowing history",
};

export default async function AccountPage() {
  const auth = await getCurrentSession("PATRON");

  let accountData = null;
  let csrfToken = "";

  if (auth && "patron" in auth) {
    const p = auth.patron;
    csrfToken = auth.session.csrfToken;

    // Run housekeeping on expired holds when visiting account
    try {
      await processExpiredHolds();
    } catch {
      // Non-fatal
    }

    accountData = await getPatronAccountData(p.id);
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <PublicHeader currentPath="/account" />
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <AccountClient accountData={accountData} csrfToken={csrfToken} />
      </main>
      <PublicFooter />
    </div>
  );
}
