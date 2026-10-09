import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { POST as payPost } from "@/app/api/fines/pay/route";
import { GET as receiptGet } from "@/app/api/fines/receipt/[receiptNo]/route";
import { GET as finesGet } from "@/app/api/fines/route";
import { POST as waivePost } from "@/app/api/fines/waive/route";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import { PATRON_SESSION_COOKIE, STAFF_SESSION_COOKIE } from "@/lib/auth";
import { loginPatron, loginStaff } from "@/services/auth";

describe("Phase 10: Fines & Payments API Route Handlers Suite", () => {
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;
  let pg: PGlite;

  let librarianSessionId: string;
  let librarianCsrf: string;

  let asstLibSessionId: string;
  let asstLibCsrf: string;

  let patronRahulSessionId: string;
  let patronRahulCsrf: string;

  let patronPriyaSessionId: string;
  let _patronPriyaCsrf: string;

  let testFineId: number;
  let waiveFineId: number;
  let generatedReceiptNo: string;

  beforeAll(async () => {
    pg = new PGlite();
    const migrationPath = path.resolve(process.cwd(), "db/migrations/0000_abnormal_the_fallen.sql");
    const migrationSql = fs.readFileSync(migrationPath, "utf8");
    const statements = migrationSql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await pg.exec(statement);
    }

    db = drizzle(pg, { schema });
    setTestDb(db);

    await seedDatabase(db);

    // Login Head Librarian (has FINE_COLLECT and FINE_WAIVE)
    const libLogin = await loginStaff({ username: "librarian", password: "Lib@123" }, db);
    librarianSessionId = libLogin.session?.id as string;
    librarianCsrf = libLogin.session?.csrfToken as string;

    // Login Assistant Librarian (has FINE_COLLECT, does NOT have FINE_WAIVE)
    const asstLogin = await loginStaff({ username: "assistant", password: "Asst@123" }, db);
    asstLibSessionId = asstLogin.session?.id as string;
    asstLibCsrf = asstLogin.session?.csrfToken as string;

    // Login Patron Rahul (Patron ID 1)
    const rahulLogin = await loginPatron(
      { identifier: "2301430100045", password: "2301430100045" },
      db,
    );
    patronRahulSessionId = rahulLogin.session?.id as string;
    patronRahulCsrf = rahulLogin.session?.csrfToken as string;

    // Login Patron Priya (Patron ID 2)
    const priyaLogin = await loginPatron(
      { identifier: "2301430100062", password: "2301430100062" },
      db,
    );
    patronPriyaSessionId = priyaLogin.session?.id as string;
    _patronPriyaCsrf = priyaLogin.session?.csrfToken as string;

    // Seed test fines for Rahul Kumar (Patron 1)
    const [f1] = await db
      .insert(schema.fines)
      .values({
        patronId: 1,
        amount: "50.00",
        paidAmount: "0.00",
        fineType: "OVERDUE",
        reason: "Test overdue fine for route suite",
        status: "OUTSTANDING",
        createdBy: 2,
      })
      .returning();
    testFineId = f1.id;

    // Seed another fine for waiver testing
    const [f2] = await db
      .insert(schema.fines)
      .values({
        patronId: 1,
        amount: "80.00",
        paidAmount: "0.00",
        fineType: "DAMAGE",
        reason: "Damaged cover page replacement assessment",
        status: "OUTSTANDING",
        createdBy: 2,
      })
      .returning();
    waiveFineId = f2.id;
  });

  describe("1. GET /api/fines", () => {
    it("returns 401 when unauthenticated", async () => {
      const req = new NextRequest("http://localhost:3000/api/fines");
      const res = await finesGet(req);
      expect(res.status).toBe(401);
    });

    it("allows staff with FINE_COLLECT to list fines", async () => {
      const req = new NextRequest("http://localhost:3000/api/fines?status=OUTSTANDING", {
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
        },
      });
      const res = await finesGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.fines)).toBe(true);
      expect(data.fines.length).toBeGreaterThanOrEqual(2);
      expect(data.totalOutstandingAmount).toBeDefined();
    });

    it("allows patron to view their own fines", async () => {
      const req = new NextRequest("http://localhost:3000/api/fines", {
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patronRahulSessionId}`,
        },
      });
      const res = await finesGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.fines.every((f: any) => f.patronId === 1)).toBe(true);
    });
  });

  describe("2. POST /api/fines/pay", () => {
    it("returns 401 when unauthenticated", async () => {
      const req = new NextRequest("http://localhost:3000/api/fines/pay", {
        method: "POST",
        body: JSON.stringify({ fineId: testFineId, amount: 20, paymentMethod: "CASH" }),
      });
      const res = await payPost(req);
      expect(res.status).toBe(401);
    });

    it("returns 403 on missing or invalid CSRF token", async () => {
      const req = new NextRequest("http://localhost:3000/api/fines/pay", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${asstLibSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fineId: testFineId,
          amount: 20,
          paymentMethod: "CASH",
          csrfToken: "bad-csrf-token",
        }),
      });
      const res = await payPost(req);
      expect(res.status).toBe(403);
    });

    it("returns 401 or 403 when patron attempts to collect fine payment", async () => {
      const req = new NextRequest("http://localhost:3000/api/fines/pay", {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patronRahulSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fineId: testFineId,
          amount: 20,
          paymentMethod: "CASH",
          csrfToken: patronRahulCsrf,
        }),
      });
      const res = await payPost(req);
      expect([401, 403]).toContain(res.status);
    });

    it("returns 400 on zero or negative payment amount", async () => {
      const req = new NextRequest("http://localhost:3000/api/fines/pay", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${asstLibSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fineId: testFineId,
          amount: -10,
          paymentMethod: "CASH",
          csrfToken: asstLibCsrf,
        }),
      });
      const res = await payPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("must be greater than zero");
    });

    it("returns 400 on invalid payment method", async () => {
      const req = new NextRequest("http://localhost:3000/api/fines/pay", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${asstLibSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fineId: testFineId,
          amount: 15,
          paymentMethod: "CRYPTO",
          csrfToken: asstLibCsrf,
        }),
      });
      const res = await payPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Payment method must be one of");
    });

    it("returns 400 on overpayment", async () => {
      // Balance is ₹50.00; try to pay ₹60.00
      const req = new NextRequest("http://localhost:3000/api/fines/pay", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${asstLibSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fineId: testFineId,
          amount: 60.0,
          paymentMethod: "CASH",
          csrfToken: asstLibCsrf,
        }),
      });
      const res = await payPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("exceeds outstanding balance");
    });

    it("returns 201 when Assistant Librarian collects partial payment (FINE_COLLECT permitted)", async () => {
      // Pay ₹20.00 towards ₹50.00 fine
      const req = new NextRequest("http://localhost:3000/api/fines/pay", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${asstLibSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fineId: testFineId,
          amount: 20.0,
          paymentMethod: "CASH",
          remarks: "Desk cash payment",
          csrfToken: asstLibCsrf,
        }),
      });
      const res = await payPost(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.isFullPayment).toBe(false);
      expect(data.remainingBalance).toBe(30.0);
      expect(data.fine.status).toBe("OUTSTANDING");
      expect(data.receiptNo).toMatch(/^RCPT-\d{4}-\d{5}$/);
      generatedReceiptNo = data.receiptNo;
    });

    it("returns 201 when Librarian settles remaining balance in full (transitions to PAID)", async () => {
      // Pay remaining ₹30.00 via CARD
      const req = new NextRequest("http://localhost:3000/api/fines/pay", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fineId: testFineId,
          amount: 30.0,
          paymentMethod: "CARD",
          remarks: "POS terminal auth #9810",
          csrfToken: librarianCsrf,
        }),
      });
      const res = await payPost(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.isFullPayment).toBe(true);
      expect(data.remainingBalance).toBe(0.0);
      expect(data.fine.status).toBe("PAID");
    });

    it("returns 400 when attempting to pay settled PAID fine", async () => {
      const req = new NextRequest("http://localhost:3000/api/fines/pay", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fineId: testFineId,
          amount: 10.0,
          paymentMethod: "CASH",
          csrfToken: librarianCsrf,
        }),
      });
      const res = await payPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("cannot accept payment");
    });
  });

  describe("3. POST /api/fines/waive", () => {
    it("returns 401 when unauthenticated", async () => {
      const req = new NextRequest("http://localhost:3000/api/fines/waive", {
        method: "POST",
        body: JSON.stringify({ fineId: waiveFineId }),
      });
      const res = await waivePost(req);
      expect(res.status).toBe(401);
    });

    it("returns 403 on missing or invalid CSRF token", async () => {
      const req = new NextRequest("http://localhost:3000/api/fines/waive", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fineId: waiveFineId,
          csrfToken: "invalid-csrf",
        }),
      });
      const res = await waivePost(req);
      expect(res.status).toBe(403);
    });

    it("returns 403 when Assistant Librarian tries to waive fine (Lacks FINE_WAIVE permission)", async () => {
      const req = new NextRequest("http://localhost:3000/api/fines/waive", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${asstLibSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fineId: waiveFineId,
          remarks: "Unauthorized waiver attempt by assistant",
          csrfToken: asstLibCsrf,
        }),
      });
      const res = await waivePost(req);
      expect(res.status).toBe(403);
    });

    it("returns 401 or 403 when Patron tries to waive fine", async () => {
      const req = new NextRequest("http://localhost:3000/api/fines/waive", {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patronRahulSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fineId: waiveFineId,
          csrfToken: patronRahulCsrf,
        }),
      });
      const res = await waivePost(req);
      expect([401, 403]).toContain(res.status);
    });

    it("returns 200 when Librarian waives fine (FINE_WAIVE authorized, T-15)", async () => {
      const req = new NextRequest("http://localhost:3000/api/fines/waive", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fineId: waiveFineId,
          remarks: "Waived per HoD recommendation approved by Principal",
          csrfToken: librarianCsrf,
        }),
      });
      const res = await waivePost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.fine.status).toBe("WAIVED");
      expect(data.waivedAmount).toBe(80.0);
      expect(data.receiptNo).toMatch(/^RCPT-\d{4}-\d{5}$/);
    });

    it("returns 400 when attempting to waive already WAIVED fine", async () => {
      const req = new NextRequest("http://localhost:3000/api/fines/waive", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fineId: waiveFineId,
          remarks: "Repeat waiver attempt",
          csrfToken: librarianCsrf,
        }),
      });
      const res = await waivePost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/cannot waive/i);
    });
  });

  describe("4. GET /api/fines/receipt/[receiptNo]", () => {
    it("returns 401 when unauthenticated", async () => {
      const params = Promise.resolve({ receiptNo: generatedReceiptNo });
      const req = new NextRequest(`http://localhost:3000/api/fines/receipt/${generatedReceiptNo}`);
      const res = await receiptGet(req, { params });
      expect(res.status).toBe(401);
    });

    it("returns 404 for unknown receipt number", async () => {
      const params = Promise.resolve({ receiptNo: "RCPT-9999-99999" });
      const req = new NextRequest("http://localhost:3000/api/fines/receipt/RCPT-9999-99999", {
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
        },
      });
      const res = await receiptGet(req, { params });
      expect(res.status).toBe(404);
    });

    it("allows staff to view receipt details", async () => {
      const params = Promise.resolve({ receiptNo: generatedReceiptNo });
      const req = new NextRequest(`http://localhost:3000/api/fines/receipt/${generatedReceiptNo}`, {
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${asstLibSessionId}`,
        },
      });
      const res = await receiptGet(req, { params });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.receipt.receiptNo).toBe(generatedReceiptNo);
      expect(data.receipt.patron.cardNo).toBe("2301430100045");
      expect(data.receipt.amount).toBe("20.00");
    });

    it("allows owning patron to view their own receipt", async () => {
      const params = Promise.resolve({ receiptNo: generatedReceiptNo });
      const req = new NextRequest(`http://localhost:3000/api/fines/receipt/${generatedReceiptNo}`, {
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patronRahulSessionId}`,
        },
      });
      const res = await receiptGet(req, { params });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.receipt.receiptNo).toBe(generatedReceiptNo);
    });

    it("returns 403 when different patron tries to view receipt", async () => {
      // Priya tries to view Rahul's receipt
      const params = Promise.resolve({ receiptNo: generatedReceiptNo });
      const req = new NextRequest(`http://localhost:3000/api/fines/receipt/${generatedReceiptNo}`, {
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patronPriyaSessionId}`,
        },
      });
      const res = await receiptGet(req, { params });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("You can only view your own receipts");
    });
  });
});
