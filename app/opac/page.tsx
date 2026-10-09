import { eq, sql } from "drizzle-orm";
import { PublicFooter, PublicHeader } from "@/components/layout/PublicHeader";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getCurrentSession } from "@/lib/auth";
import { type OpacBook, OpacClient } from "./OpacClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "OPAC — Online Public Access Catalogue — RBMI Central Library",
  description: "Search books, journals, and learning resources across RBMI campus libraries",
};

export default async function OpacPage() {
  const auth = await getCurrentSession("PATRON");
  const isLoggedInPatron = Boolean(auth && "patron" in auth);
  const csrfToken = auth?.session?.csrfToken ?? "";

  let books: OpacBook[] = [];

  try {
    // Query public catalogue records
    const rawBibs = await db
      .select({
        id: schema.bibRecords.id,
        title: schema.bibRecords.title,
        subtitle: schema.bibRecords.subtitle,
        authors: schema.bibRecords.authors,
        isbn: schema.bibRecords.isbn,
        edition: schema.bibRecords.edition,
        pubYear: schema.bibRecords.pubYear,
        callNumber: schema.bibRecords.callNumber,
        totalCopies: sql<number>`count(${schema.items.id})::int`,
        availableCopies: sql<number>`count(case when ${schema.items.status} = 'AVAILABLE' then 1 end)::int`,
      })
      .from(schema.bibRecords)
      .leftJoin(schema.items, eq(schema.bibRecords.id, schema.items.bibId))
      .groupBy(schema.bibRecords.id)
      .orderBy(schema.bibRecords.title)
      .limit(100);

    books = rawBibs.map((b) => ({
      id: b.id,
      title: b.title,
      subtitle: b.subtitle,
      authors: b.authors,
      isbn: b.isbn,
      edition: b.edition,
      pubYear: b.pubYear,
      callNumber: b.callNumber,
      totalCopies: b.totalCopies,
      availableCopies: b.availableCopies,
    }));
  } catch {
    books = [];
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <PublicHeader />
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <OpacClient
          initialBooks={books}
          isLoggedInPatron={isLoggedInPatron}
          csrfToken={csrfToken}
        />
      </main>
      <PublicFooter />
    </div>
  );
}
