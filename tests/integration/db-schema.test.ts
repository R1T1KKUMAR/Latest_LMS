import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { seedDatabase } from "@/db/seed";

// Helper to run generated Drizzle migrations against a clean PGlite instance
async function setupMigratedDatabase(): Promise<{
  pg: PGlite;
  db: ReturnType<typeof drizzle>;
}> {
  const pg = new PGlite();
  const migrationPath = path.resolve(process.cwd(), "db/migrations/0000_abnormal_the_fallen.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await pg.exec(statement);
  }

  const db = drizzle(pg, { schema });
  return { pg, db };
}

describe("Database Foundation & Schema Verification", () => {
  it("creates all 23 database tables (22 domain + sessions)", async () => {
    const { pg } = await setupMigratedDatabase();

    const result = await pg.query<{ table_name: string }>(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name;`,
    );

    const tables = result.rows.map((r) => r.table_name);

    const expectedTables = [
      "audit_logs",
      "bib_records",
      "circulation_rules",
      "courses",
      "departments",
      "fines",
      "holds",
      "import_batches",
      "institutions",
      "item_types",
      "items",
      "libraries",
      "loans",
      "patron_categories",
      "patrons",
      "payments",
      "permissions",
      "role_permissions",
      "roles",
      "sessions",
      "system_settings",
      "users",
      "vendors",
    ];

    expect(tables).toHaveLength(23);
    for (const expected of expectedTables) {
      expect(tables).toContain(expected);
    }
  });

  it("creates all 6 SQL views and allows executing queries on them", async () => {
    const { pg } = await setupMigratedDatabase();

    const result = await pg.query<{ table_name: string }>(
      `SELECT table_name 
       FROM information_schema.views 
       WHERE table_schema = 'public'
       ORDER BY table_name;`,
    );

    const views = result.rows.map((r) => r.table_name);

    const expectedViews = [
      "v_accession_register",
      "v_active_loans",
      "v_bib_availability",
      "v_outstanding_fines",
      "v_overdue_loans",
      "v_patron_summary",
    ];

    expect(views).toHaveLength(6);
    for (const expected of expectedViews) {
      expect(views).toContain(expected);
    }

    // Verify all 6 views are valid queries and can be executed without error
    for (const viewName of expectedViews) {
      const queryResult = await pg.query(`SELECT * FROM ${viewName} LIMIT 1;`);
      expect(queryResult.rows).toBeDefined();
    }
  });

  it("creates and increments both sequences (seq_card_no, seq_receipt_no)", async () => {
    const { pg } = await setupMigratedDatabase();

    const result = await pg.query<{ sequence_name: string }>(
      `SELECT sequence_name 
       FROM information_schema.sequences 
       WHERE sequence_schema = 'public'
       ORDER BY sequence_name;`,
    );

    const sequences = result.rows.map((r) => r.sequence_name);
    expect(sequences).toContain("seq_card_no");
    expect(sequences).toContain("seq_receipt_no");

    // Test sequence 1: seq_card_no
    const cardVal1 = await pg.query<{ nextval: string }>("SELECT nextval('seq_card_no');");
    expect(Number(cardVal1.rows[0].nextval)).toBe(1);
    const cardVal2 = await pg.query<{ nextval: string }>("SELECT nextval('seq_card_no');");
    expect(Number(cardVal2.rows[0].nextval)).toBe(2);

    // Test sequence 2: seq_receipt_no
    const receiptVal1 = await pg.query<{ nextval: string }>("SELECT nextval('seq_receipt_no');");
    expect(Number(receiptVal1.rows[0].nextval)).toBe(1);
    const receiptVal2 = await pg.query<{ nextval: string }>("SELECT nextval('seq_receipt_no');");
    expect(Number(receiptVal2.rows[0].nextval)).toBe(2);
  });

  it("enforces NUMERIC(10, 2) for monetary columns", async () => {
    const { pg } = await setupMigratedDatabase();

    const result = await pg.query<{
      table_name: string;
      column_name: string;
      numeric_precision: number;
      numeric_scale: number;
    }>(
      `SELECT table_name, column_name, numeric_precision, numeric_scale
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND data_type = 'numeric'
         AND column_name IN ('price', 'amount', 'paid_amount', 'fine_per_day', 'max_fine');`,
    );

    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(row.numeric_precision).toBe(10);
      expect(row.numeric_scale).toBe(2);
    }
  });

  it("enforces the active-hold uniqueness constraint (uq_active_hold_per_patron_title)", async () => {
    const { pg } = await setupMigratedDatabase();

    // 1. Setup prerequisite records
    await pg.exec(`
      INSERT INTO institutions (id, code, name) VALUES (1, 'INST-1', 'Test Institute');
      INSERT INTO libraries (id, institution_id, code, name, accession_prefix, next_accession_no)
        VALUES (1, 1, 'LIB-1', 'Main Library', 'LIB', 1);
      INSERT INTO patron_categories (id, code, name, patron_type, card_validity_years)
        VALUES (1, 'CAT-1', 'Student Cat', 'STUDENT', 1);
      INSERT INTO item_types (id, code, name) VALUES (1, 'BOOK', 'Book');
      INSERT INTO patrons (id, card_no, patron_type, category_id, first_name, card_expiry, username, password_hash)
        VALUES (1, 'CARD-001', 'STUDENT', 1, 'Test Patron', CURRENT_DATE + 365, 'patron1', 'hash');
      INSERT INTO bib_records (id, title, authors, item_type_id)
        VALUES (1, 'Introduction to Algorithms', 'CLRS', 1);
    `);

    // 2. Insert first active hold (WAITING) -> Succeeded
    await pg.exec(`
      INSERT INTO holds (id, patron_id, bib_id, status)
      VALUES (1, 1, 1, 'WAITING');
    `);

    // 3. Second active hold (WAITING) for same patron & title -> MUST FAIL with unique violation
    await expect(
      pg.exec(`
        INSERT INTO holds (id, patron_id, bib_id, status)
        VALUES (2, 1, 1, 'WAITING');
      `),
    ).rejects.toThrow(/unique|duplicate/i);

    // 4. Second active hold with status 'AVAILABLE_FOR_PICKUP' -> MUST ALSO FAIL
    await expect(
      pg.exec(`
        INSERT INTO holds (id, patron_id, bib_id, status)
        VALUES (3, 1, 1, 'AVAILABLE_FOR_PICKUP');
      `),
    ).rejects.toThrow(/unique|duplicate/i);

    // 5. Complete the first hold
    await pg.exec(`UPDATE holds SET status = 'COMPLETED' WHERE id = 1;`);

    // 6. Now inserting a new active hold for same patron & title -> MUST SUCCEED
    await pg.exec(`
      INSERT INTO holds (id, patron_id, bib_id, status)
      VALUES (4, 1, 1, 'WAITING');
    `);

    // 7. Cancel the second hold
    await pg.exec(`UPDATE holds SET status = 'CANCELLED' WHERE id = 4;`);

    // 8. Inserting another active hold after cancel -> MUST SUCCEED
    await pg.exec(`
      INSERT INTO holds (id, patron_id, bib_id, status)
      VALUES (5, 1, 1, 'WAITING');
    `);
  });

  it("enforces check constraints and foreign key RESTRICT behaviors", async () => {
    const { pg } = await setupMigratedDatabase();

    await pg.exec(`
      INSERT INTO institutions (id, code, name) VALUES (1, 'INST-1', 'Test Institute');
      INSERT INTO libraries (id, institution_id, code, name, accession_prefix, next_accession_no)
        VALUES (1, 1, 'LIB-1', 'Main Library', 'LIB', 1);
      INSERT INTO patron_categories (id, code, name, patron_type, card_validity_years)
        VALUES (1, 'CAT-1', 'Student Cat', 'STUDENT', 1);
      INSERT INTO patrons (id, card_no, patron_type, category_id, first_name, card_expiry, username, password_hash)
        VALUES (1, 'CARD-001', 'STUDENT', 1, 'Test Patron', CURRENT_DATE + 365, 'patron1', 'hash');
      INSERT INTO roles (id, code, name) VALUES (1, 'ADMIN', 'Admin');
      INSERT INTO users (id, username, password_hash, full_name, role_id, library_id)
        VALUES (1, 'admin', 'hash', 'Admin User', 1, 1);
    `);

    // chk_fine_amount: fine amount <= 0 rejected
    await expect(
      pg.exec(`
        INSERT INTO fines (patron_id, amount, fine_type, reason, created_by)
        VALUES (1, 0.00, 'OVERDUE', 'Zero fine test', 1);
      `),
    ).rejects.toThrow(/chk_fine_amount|check constraint/i);

    // chk_rule_loan_days: negative loan days rejected
    await expect(
      pg.exec(`
        INSERT INTO circulation_rules (library_id, category_id, loan_days, fine_per_day)
        VALUES (1, 1, -5, 2.00);
      `),
    ).rejects.toThrow(/chk_rule_loan_days|check constraint/i);

    // chk_patron_status: invalid patron status rejected
    await expect(
      pg.exec(`
        INSERT INTO patrons (card_no, patron_type, category_id, first_name, card_expiry, username, password_hash, status)
        VALUES ('CARD-002', 'STUDENT', 1, 'Bad Patron', CURRENT_DATE + 365, 'patron2', 'hash', 'INVALID_STATUS');
      `),
    ).rejects.toThrow(/chk_patron_status|check constraint/i);

    // Foreign key RESTRICT: deleting institution referenced by library must fail
    await expect(pg.exec(`DELETE FROM institutions WHERE id = 1;`)).rejects.toThrow(
      /violates.*foreign key constraint/i,
    );
  });

  it("successfully applies baseline seed data and populates views accurately", async () => {
    const { pg, db } = await setupMigratedDatabase();

    // Run seed against the migrated database instance
    await seedDatabase(db as unknown as Parameters<typeof seedDatabase>[0]);

    // Verify seed entity counts
    const instCount = await pg.query<{ count: string }>("SELECT COUNT(*) FROM institutions;");
    expect(Number(instCount.rows[0].count)).toBe(5);

    const libCount = await pg.query<{ count: string }>("SELECT COUNT(*) FROM libraries;");
    expect(Number(libCount.rows[0].count)).toBe(5);

    const roleCount = await pg.query<{ count: string }>("SELECT COUNT(*) FROM roles;");
    expect(Number(roleCount.rows[0].count)).toBe(4);

    const permCount = await pg.query<{ count: string }>("SELECT COUNT(*) FROM permissions;");
    expect(Number(permCount.rows[0].count)).toBe(21);

    const userCount = await pg.query<{ count: string }>("SELECT COUNT(*) FROM users;");
    expect(Number(userCount.rows[0].count)).toBe(3);

    const patronCount = await pg.query<{ count: string }>("SELECT COUNT(*) FROM patrons;");
    expect(Number(patronCount.rows[0].count)).toBe(4);

    const bibCount = await pg.query<{ count: string }>("SELECT COUNT(*) FROM bib_records;");
    expect(Number(bibCount.rows[0].count)).toBe(4);

    const itemCount = await pg.query<{ count: string }>("SELECT COUNT(*) FROM items;");
    expect(Number(itemCount.rows[0].count)).toBe(5);

    const loanCount = await pg.query<{ count: string }>("SELECT COUNT(*) FROM loans;");
    expect(Number(loanCount.rows[0].count)).toBe(3);

    const holdCount = await pg.query<{ count: string }>("SELECT COUNT(*) FROM holds;");
    expect(Number(holdCount.rows[0].count)).toBe(1);

    const ruleCount = await pg.query<{ count: string }>("SELECT COUNT(*) FROM circulation_rules;");
    expect(Number(ruleCount.rows[0].count)).toBe(20);

    const settingCount = await pg.query<{ count: string }>("SELECT COUNT(*) FROM system_settings;");
    expect(Number(settingCount.rows[0].count)).toBe(17);

    // Verify Views with seeded data
    // 1. v_active_loans
    const activeLoans = await pg.query<{ loan_id: number; patron_name: string }>(
      "SELECT * FROM v_active_loans;",
    );
    expect(activeLoans.rows.length).toBe(3);

    // 2. v_overdue_loans: Rahul Kumar should have 1 overdue loan with 12 days overdue
    const overdueLoans = await pg.query<{
      loan_id: number;
      card_no: string;
      days_overdue: number;
    }>("SELECT * FROM v_overdue_loans;");
    expect(overdueLoans.rows.length).toBe(1);
    expect(overdueLoans.rows[0].card_no).toBe("2301430100045");
    expect(overdueLoans.rows[0].days_overdue).toBe(12);

    // 3. v_bib_availability: Algorithms title should have 2 total copies, 2 issued, 1 waiting hold
    const algoAvailability = await pg.query<{
      title: string;
      total_copies: number;
      issued_copies: number;
      waiting_holds: number;
    }>("SELECT * FROM v_bib_availability WHERE title LIKE '%Algorithms%';");
    expect(algoAvailability.rows.length).toBe(1);
    expect(algoAvailability.rows[0].total_copies).toBe(2);
    expect(algoAvailability.rows[0].issued_copies).toBe(2);
    expect(algoAvailability.rows[0].waiting_holds).toBe(1);

    // 4. v_accession_register: should list all 5 items
    const accessionReg = await pg.query("SELECT * FROM v_accession_register;");
    expect(accessionReg.rows.length).toBe(5);

    // 5. v_patron_summary: Rahul should have 1 active loan, 1 overdue loan
    const patronSummary = await pg.query<{
      card_no: string;
      active_loans_count: number;
      overdue_loans_count: number;
    }>("SELECT * FROM v_patron_summary WHERE card_no = '2301430100045';");
    expect(patronSummary.rows.length).toBe(1);
    expect(patronSummary.rows[0].active_loans_count).toBe(1);
    expect(patronSummary.rows[0].overdue_loans_count).toBe(1);
  });
});
