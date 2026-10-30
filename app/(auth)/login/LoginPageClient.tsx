"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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

  // Database connectivity state per FR-ST-02
  const [dbState, setDbState] = useState<{
    reachable: boolean;
    sanitizedUrl?: string;
    errorMessage?: string;
    checked: boolean;
    restored?: boolean;
  }>({
    reachable: true,
    checked: false,
  });
  const [isCheckingDb, setIsCheckingDb] = useState(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const checkDbHealth = useCallback(async (isManualRetry = false) => {
    if (isManualRetry) setIsCheckingDb(true);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const data = await res.json();
      const dbCheck = data.checks?.database;

      if (res.ok && dbCheck?.connected) {
        setDbState((prev) => {
          const wasDown = prev.checked && !prev.reachable;
          return {
            reachable: true,
            sanitizedUrl: dbCheck.sanitizedUrl,
            errorMessage: undefined,
            checked: true,
            restored: wasDown,
          };
        });
      } else {
        const errorMsg = dbCheck?.error || "Connection refused or unreachable";
        const url = dbCheck?.sanitizedUrl || "postgresql://[host]/[db]";
        setDbState({
          reachable: false,
          sanitizedUrl: url,
          errorMessage: errorMsg,
          checked: true,
          restored: false,
        });
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Network failure connecting to health endpoint";
      setDbState((prev) => ({
        reachable: false,
        sanitizedUrl: prev.sanitizedUrl || "postgresql://[host]/[db]",
        errorMessage: msg,
        checked: true,
        restored: false,
      }));
    } finally {
      if (isManualRetry) setIsCheckingDb(false);
    }
  }, []);

  // Initial check on mount
  useEffect(() => {
    checkDbHealth();
  }, [checkDbHealth]);

  // Set up auto-retry polling when database is unreachable (FR-ST-02: recovers without restart)
  useEffect(() => {
    if (!dbState.reachable) {
      pollTimerRef.current = setInterval(() => {
        checkDbHealth();
      }, 5000);
    } else if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [dbState.reachable, checkDbHealth]);

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

      if (res.status === 503 || data.dbUnreachable) {
        setDbState({
          reachable: false,
          sanitizedUrl: data.dbUrl || "postgresql://[host]/[db]",
          errorMessage: data.error || "Database unreachable",
          checked: true,
          restored: false,
        });
        setError(null);
        return;
      }

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

      if (res.status === 503 || data.dbUnreachable) {
        setDbState({
          reachable: false,
          sanitizedUrl: data.dbUrl || "postgresql://[host]/[db]",
          errorMessage: data.error || "Database unreachable",
          checked: true,
          restored: false,
        });
        setError(null);
        return;
      }

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
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 sm:p-8 shadow-sm">
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

      {/* FR-ST-02: Database Unreachable Diagnostic Banner */}
      {!dbState.reachable && (
        <div
          className="mt-5 rounded-xl border border-red-300 bg-red-50 p-4 text-xs text-red-900 shadow-xs"
          role="alert"
        >
          <div className="flex items-start space-x-2.5">
            <span className="text-lg leading-none select-none">🚨</span>
            <div className="flex-1 space-y-1.5">
              <h3 className="font-bold text-red-900 text-sm">Database Not Reachable</h3>
              <p className="text-red-800 leading-relaxed">
                The library system cannot establish a connection to the database. Sign in is
                temporarily disabled.
              </p>
              <div className="rounded-lg bg-red-100/80 p-2.5 font-mono text-[11px] text-red-950 border border-red-200 break-all space-y-1">
                <div>
                  <span className="font-bold text-red-900">Target URL:</span>{" "}
                  {dbState.sanitizedUrl || "postgresql://..."}
                </div>
                {dbState.errorMessage && (
                  <div>
                    <span className="font-bold text-red-900">Error:</span> {dbState.errorMessage}
                  </div>
                )}
              </div>
              <p className="text-[11px] text-red-700 italic">
                The system will automatically recover without restarting once the database service
                is resumed.
              </p>
              <div className="pt-1 flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => checkDbHealth(true)}
                  disabled={isCheckingDb}
                  className="text-red-900 border-red-300 hover:bg-red-100 font-bold text-[11px] py-1 h-auto"
                >
                  {isCheckingDb ? "Checking..." : "🔄 Retry Connection"}
                </Button>
                <span className="text-[10px] text-red-600 animate-pulse font-medium">
                  Auto-checking every 5s...
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Connection Restored Notice */}
      {dbState.restored && dbState.reachable && (
        <div className="mt-4">
          <Alert variant="success" onDismiss={() => setDbState((s) => ({ ...s, restored: false }))}>
            ✅ Database connection restored! The library system is online. You may now sign in.
          </Alert>
        </div>
      )}

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
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
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

          <Button
            type="submit"
            isLoading={loading}
            disabled={loading || !dbState.reachable}
            className="w-full"
          >
            Sign In as Staff
          </Button>
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
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
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

          <Button
            type="submit"
            isLoading={loading}
            disabled={loading || !dbState.reachable}
            className="w-full"
          >
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
