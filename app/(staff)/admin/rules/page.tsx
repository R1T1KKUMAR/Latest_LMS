import Link from "next/link";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { requirePageAuth } from "@/lib/auth";
import {
  getCachedCirculationRules,
  getCachedItemTypes,
  getCachedLibraries,
  getCachedPatronCategories,
} from "@/lib/master-data-cache";

export const metadata = {
  title: "Circulation Policy Rules — RBMI LMS",
  description: "View circulation rules matrix for book issues, fine rates, and renewals",
};

export default async function AdminRulesPage() {
  const auth = await requirePageAuth("ADMIN_RULES");

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to Circulation Policy Rules requires ADMIN_RULES permission."
          requiredPermission="ADMIN_RULES"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const [rulesList, categories, itemTypes, libraries] = await Promise.all([
    getCachedCirculationRules(),
    getCachedPatronCategories(),
    getCachedItemTypes(),
    getCachedLibraries(),
  ]);

  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const itemTypeMap = new Map(itemTypes.map((i) => [i.id, i.name]));
  const libMap = new Map(libraries.map((l) => [l.id, l.name]));

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <PageHeader
        title="Circulation Policy Rules"
        description="Active book issue policies, renewal limits, fine calculations, and hold eligibility matrix."
        actions={
          <Link
            href="/admin"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
          >
            &larr; Admin Portal
          </Link>
        }
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-200 bg-slate-50/75 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-800">
            Circulation Matrix ({rulesList.length} Active Rules)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Rules are evaluated hierarchically: Library branch, Item type, and Patron category.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-3">Rule ID</th>
                <th className="px-6 py-3">Library Branch</th>
                <th className="px-6 py-3">Patron Category</th>
                <th className="px-6 py-3">Item Type</th>
                <th className="px-6 py-3 text-center">Max Books</th>
                <th className="px-6 py-3 text-center">Issue Duration</th>
                <th className="px-6 py-3 text-center">Renewals</th>
                <th className="px-6 py-3 text-right">Fine/Day</th>
                <th className="px-6 py-3 text-right">Max Fine</th>
                <th className="px-6 py-3 text-center">Holds</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rulesList.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-3.5 font-mono text-xs text-slate-500">#{r.id}</td>
                  <td className="px-6 py-3.5 font-medium text-slate-800">
                    {r.libraryId
                      ? (libMap.get(r.libraryId) ?? `Branch #${r.libraryId}`)
                      : "All Branches"}
                  </td>
                  <td className="px-6 py-3.5">
                    {r.categoryId ? (
                      <span className="inline-flex rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {catMap.get(r.categoryId) ?? `Category #${r.categoryId}`}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">All Categories</span>
                    )}
                  </td>
                  <td className="px-6 py-3.5">
                    {r.itemTypeId ? (
                      <span className="inline-flex rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                        {itemTypeMap.get(r.itemTypeId) ?? `Item #${r.itemTypeId}`}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">All Items</span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-center font-semibold text-slate-800">
                    {r.maxBooks}
                  </td>
                  <td className="px-6 py-3.5 text-center text-slate-700">{r.loanDays} days</td>
                  <td className="px-6 py-3.5 text-center text-slate-700">{r.maxRenewals}</td>
                  <td className="px-6 py-3.5 text-right font-medium text-amber-700">
                    ₹{r.finePerDay}
                  </td>
                  <td className="px-6 py-3.5 text-right text-slate-500">
                    {r.maxFine ? `₹${r.maxFine}` : "No Cap"}
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    {r.holdsAllowed ? (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                        Allowed
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                        Blocked
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
