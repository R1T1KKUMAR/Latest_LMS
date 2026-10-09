import { PublicFooter, PublicHeader } from "@/components/layout/PublicHeader";
import { LoginPageClient } from "./LoginPageClient";

export const metadata = {
  title: "Sign In — RBMI Library Management System",
  description: "Staff and Patron authentication portal for RBMI Central Library",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <PublicHeader currentPath="/login" />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <LoginPageClient />
      </main>

      <PublicFooter />
    </div>
  );
}
