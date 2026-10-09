"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function LoginPageClient() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"staff" | "patron">("staff");

  // Staff Form State
  const [staffUsername, setStaffUsername] = useState("");
  const [staffPassword, setStaffPassword] = useState("");

  // Patron Form State
  const [patronIdentifier, setPatronIdentifier] = useState("");
  const [patronPassword, setPatronPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: staffUsername,
          password: staffPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Invalid username or password");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("Network error. Please ensure application server is online.");
    } finally {
      setLoading(false);
    }
  };

  const handlePatronLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/patron/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: patronIdentifier,
          password: patronPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Invalid credentials");
      } else {
        router.push("/account");
        router.refresh();
      }
    } catch {
      setError("Network error. Please ensure application server is online.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-900 text-lg font-bold text-white shadow-xs">
          LMS
        </span>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
          Sign in to Library
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          RBMI Group of Institutions Campus Library System
        </p>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex rounded-lg bg-slate-100 p-1 text-xs font-semibold">
        <button
          type="button"
          onClick={() => {
            setActiveTab("staff");
            setError(null);
          }}
          className={`flex-1 rounded-md py-2 transition ${
            activeTab === "staff"
              ? "bg-white text-blue-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Staff Sign In
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("patron");
            setError(null);
          }}
          className={`flex-1 rounded-md py-2 transition ${
            activeTab === "patron"
              ? "bg-white text-blue-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Patron OPAC Sign In
        </button>
      </div>

      {error && (
        <div className="mt-4">
          <Alert variant="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      {/* Staff Form */}
      {activeTab === "staff" && (
        <form onSubmit={handleStaffLogin} className="mt-5 space-y-4">
          <Input
            id="staff-username"
            label="Staff Username"
            type="text"
            required
            value={staffUsername}
            onChange={(e) => setStaffUsername(e.target.value)}
            placeholder="e.g. admin or librarian"
          />

          <Input
            id="staff-password"
            label="Password"
            type="password"
            required
            value={staffPassword}
            onChange={(e) => setStaffPassword(e.target.value)}
            placeholder="••••••••"
          />

          <Button type="submit" isLoading={loading} className="w-full">
            Sign In as Staff
          </Button>

          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600 space-y-1">
            <div className="font-semibold text-slate-800">Seed Demo Accounts:</div>
            <div>
              &bull; Super Admin: <code className="font-mono text-slate-900">admin</code> /{" "}
              <code className="font-mono text-slate-900">Admin@123</code>
            </div>
            <div>
              &bull; Librarian: <code className="font-mono text-slate-900">librarian</code> /{" "}
              <code className="font-mono text-slate-900">Lib@123</code>
            </div>
            <div>
              &bull; Asst Librarian: <code className="font-mono text-slate-900">assistant</code> /{" "}
              <code className="font-mono text-slate-900">Asst@123</code>
            </div>
          </div>
        </form>
      )}

      {/* Patron Form */}
      {activeTab === "patron" && (
        <form onSubmit={handlePatronLogin} className="mt-5 space-y-4">
          <Input
            id="patron-identifier"
            label="Card No / Roll No / Employee ID"
            type="text"
            required
            value={patronIdentifier}
            onChange={(e) => setPatronIdentifier(e.target.value)}
            placeholder="e.g. 2301430100045"
            helperText="Students use Roll No; Faculty use Employee ID or Library Card No"
          />

          <Input
            id="patron-password"
            label="Password"
            type="password"
            required
            value={patronPassword}
            onChange={(e) => setPatronPassword(e.target.value)}
            placeholder="••••••••"
            helperText="Initial password equals Card / Roll Number (FR-AU-05)"
          />

          <Button type="submit" isLoading={loading} className="w-full">
            Sign In to OPAC
          </Button>

          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600 space-y-1">
            <div className="font-semibold text-slate-800">Seed Demo Student:</div>
            <div>
              &bull; Roll No: <code className="font-mono text-slate-900">2301430100045</code>
            </div>
            <div>
              &bull; Password: <code className="font-mono text-slate-900">2301430100045</code>{" "}
              (Rahul Kumar)
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
