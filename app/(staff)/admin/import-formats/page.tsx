import Link from "next/link";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { requirePageAuth } from "@/lib/auth";
import { getImportFormat } from "@/services/import-format";
import { ImportFormatManagerClient } from "./ImportFormatManagerClient";

export const metadata = {
  title: "Bulk Import Format Configuration — RBMI LMS",
  description:
    "Customize CSV headers, delete optional attributes, and configure bulk import column specifications",
};

export default async function ImportFormatsPage() {
  const auth = await requirePageAuth("ADMIN_SETTINGS");

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to Import Format Management requires ADMIN_SETTINGS permission."
          requiredPermission="ADMIN_SETTINGS"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const staffContext = auth.context;

  // Load formats for all three categories
  const [studentColumns, facultyColumns, catalogColumns] = await Promise.all([
    getImportFormat("STUDENT"),
    getImportFormat("FACULTY"),
    getImportFormat("CATALOGUE"),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk Import Format Configuration"
        description="Configure expected CSV/Excel headers, manage required and optional attributes, and control mapping to database records."
        badge="System Administration"
        badgeColor="purple"
        breadcrumbs={[{ label: "Admin Portal", href: "/admin" }, { label: "Import Formats" }]}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/import"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
            >
              <span>📥</span>
              <span>Go to Bulk Import &rarr;</span>
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
            >
              &larr; Admin Portal
            </Link>
          </div>
        }
      />

      <ImportFormatManagerClient
        csrfToken={staffContext.session.csrfToken}
        initialStudentColumns={studentColumns}
        initialFacultyColumns={facultyColumns}
        initialCatalogColumns={catalogColumns}
      />
    </div>
  );
}
