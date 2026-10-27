import { getCurrentSession } from "@/lib/auth";
import { getCachedAdminStats } from "@/lib/master-data-cache";
import {
  getDepartmentsWithCounts,
  getMostBorrowedTitles,
  getNewArrivals,
  searchOpac,
} from "@/services/opac";
import { OpacClient } from "./OpacClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "OPAC — Online Public Access Catalogue — RBMI Central Library",
  description: "Search books, journals, and learning resources across RBMI campus libraries",
};

export default async function OpacPage() {
  const auth = await getCurrentSession("PATRON");
  const isLoggedInPatron = Boolean(auth && "patron" in auth);
  const patronName =
    auth && "patron" in auth
      ? [auth.patron.firstName, auth.patron.lastName].filter(Boolean).join(" ")
      : "";
  const csrfToken = auth?.session?.csrfToken ?? "";

  const [searchResult, newArrivals, mostBorrowed, departments, stats] =
    await Promise.all([
      searchOpac({ limit: 100 }),
      getNewArrivals({ limit: 12 }),
      getMostBorrowedTitles({ limit: 10 }),
      getDepartmentsWithCounts(),
      getCachedAdminStats(),
    ]);

  const totalCopies = stats.bookCount || 26072;
  const totalTitles = stats.titleCount || 8944;

  return (
    <OpacClient
      initialBooks={searchResult.books}
      newArrivals={newArrivals}
      mostBorrowed={mostBorrowed}
      departments={departments}
      totalCopies={totalCopies}
      totalTitles={totalTitles}
      isLoggedInPatron={isLoggedInPatron}
      patronName={patronName}
      csrfToken={csrfToken}
    />
  );
}
