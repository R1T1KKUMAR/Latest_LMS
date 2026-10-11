import type React from "react";
import { PublicFooter, PublicHeader } from "@/components/layout/PublicHeader";

export const metadata = {
  title: "OPAC — Online Public Access Catalogue — RBMI Central Library",
  description:
    "Search books, journals, and learning resources across RBMI Group of Institutions libraries",
};

export default function OpacLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <PublicHeader currentPath="/opac" />
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">{children}</main>
      <PublicFooter />
    </div>
  );
}
