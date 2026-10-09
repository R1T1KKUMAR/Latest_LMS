import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { requirePageAuth } from "@/lib/auth";
import { ReportsClient } from "./ReportsClient";

export const metadata = {
  title: "Reports & Analytics — RBMI LMS",
  description: "Comprehensive statutory and operational reports per SRS Section 4.13",
};

export default async function ReportsPage() {
  const auth = await requirePageAuth("REPORT_VIEW");

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to Reports & Analytics requires the REPORT_VIEW permission."
          requiredPermission="REPORT_VIEW"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports &amp; Statutory Registers"
        description="Access and export the complete 13-report repository specified in SRS Section 4.13."
        badge="Analytics"
        badgeColor="blue"
        breadcrumbs={[{ label: "Analytics" }, { label: "Reports" }]}
      />

      <ReportsClient />
    </div>
  );
}
