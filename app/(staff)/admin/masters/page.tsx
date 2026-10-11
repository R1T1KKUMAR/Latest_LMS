import Link from "next/link";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { requirePageAuth } from "@/lib/auth";

export const metadata = {
  title: "Master Data Management — RBMI LMS",
  description: "View educational institutions, libraries, academic departments, courses, and vendors",
};

export default async function AdminMastersPage() {
  const auth = await requirePageAuth("ADMIN_MASTERS");

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to Master Data requires ADMIN_MASTERS permission."
          requiredPermission="ADMIN_MASTERS"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const [institutions, libraries, departments, courses, categories, itemTypes, vendors] =
    await Promise.all([
      db.select().from(schema.institutions),
      db.select().from(schema.libraries),
      db.select().from(schema.departments),
      db.select().from(schema.courses),
      db.select().from(schema.patronCategories),
      db.select().from(schema.itemTypes),
      db.select().from(schema.vendors),
    ]);

  return (
    <div className="container mx-auto space-y-8 px-4 py-8">
      <PageHeader
        title="Master Records"
        description="Core institutional taxonomy, academic faculties, programs, patron classifications, and item types."
        actions={
          <Link
            href="/admin"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
          >
            &larr; Admin Portal
          </Link>
        }
      />

      {/* Grid of master entities */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Libraries */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Branch Libraries</h3>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
              {libraries.length}
            </span>
          </div>
          <div className="mt-4 space-y-2.5">
            {libraries.map((l) => (
              <div key={l.id} className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-800">{l.name}</span>
                <span className="font-mono text-slate-500">[{l.accessionPrefix}]</span>
              </div>
            ))}
          </div>
        </div>

        {/* Institutions */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Institutions</h3>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
              {institutions.length}
            </span>
          </div>
          <div className="mt-4 space-y-2.5">
            {institutions.map((i) => (
              <div key={i.id} className="text-xs">
                <div className="font-medium text-slate-800">{i.name}</div>
                <div className="font-mono text-slate-400">{i.code}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Patron Categories */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Patron Categories</h3>
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700">
              {categories.length}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {categories.slice(0, 6).map((c) => (
              <div key={c.id} className="flex items-center justify-between text-xs">
                <span className="text-slate-800">{c.name}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                  {c.patronType}
                </span>
              </div>
            ))}
            {categories.length > 6 && (
              <p className="text-[11px] text-slate-400">+{categories.length - 6} more categories</p>
            )}
          </div>
        </div>

        {/* Item Types */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Item Taxonomy</h3>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
              {itemTypes.length}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {itemTypes.map((it) => (
              <div key={it.id} className="flex items-center justify-between text-xs">
                <span className="text-slate-800">{it.name}</span>
                {it.isReference && (
                  <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                    Reference
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Academic Departments */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Departments</h3>
            <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-bold text-cyan-700">
              {departments.length}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {departments.slice(0, 6).map((d) => (
              <div key={d.id} className="flex items-center justify-between text-xs">
                <span className="text-slate-800">{d.name}</span>
                <span className="font-mono text-slate-400">{d.code}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Vendors */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Suppliers & Vendors</h3>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
              {vendors.length}
            </span>
          </div>
          <div className="mt-4 space-y-2.5">
            {vendors.map((v) => (
              <div key={v.id} className="text-xs">
                <div className="font-medium text-slate-800">{v.name}</div>
                <div className="text-slate-400">{v.contactPerson} ({v.phone})</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
