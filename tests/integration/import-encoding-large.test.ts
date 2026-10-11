import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import iconv from "iconv-lite";
import { beforeAll, describe, expect, it } from "vitest";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { validateBookCsv } from "@/services/book-import";
import { validatePatronCsv } from "@/services/patron-import";

describe("Phase 13: Encodings, Malformed CSVs, and High-Throughput Large Files", () => {
  let pglite: PGlite;
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;

  beforeAll(async () => {
    pglite = new PGlite();
    db = drizzle(pglite, { schema });
    setTestDb(db);

    const migrationPath = resolve(process.cwd(), "db/migrations/0000_abnormal_the_fallen.sql");
    const migrationSql = readFileSync(migrationPath, "utf-8");
    await pglite.exec(migrationSql);

    const { seedDatabase } = await import("@/db/seed");
    await seedDatabase(db);
  });

  it("1. Successfully decodes and parses Windows-1252 encoded CSV with non-ASCII characters", async () => {
    // Windows-1252 text with French accented characters
    const win1252Text = [
      "title,authors,copies,publisher",
      "Émile et les Détectives,Erich Kästner,1,Hachette Livre",
      "Le Petit Prince,Antoine de Saint-Exupéry,1,Reynal & Hitchcock",
    ].join("\r\n");

    const win1252Buffer = iconv.encode(win1252Text, "win1252");

    const preview = await validateBookCsv(
      win1252Buffer,
      { encoding: "windows-1252", fileName: "french_books.csv" },
      db,
    );

    expect(preview.summary.totalRows).toBe(2);
    expect(preview.summary.okCount).toBe(2);
    expect(preview.rows[0].data?.title).toBe("Émile et les Détectives");
    expect(preview.rows[0].data?.authors).toBe("Erich Kästner");
    expect(preview.rows[1].data?.authors).toBe("Antoine de Saint-Exupéry");
  });

  it("2. Successfully strips UTF-8 Byte Order Mark (BOM) without corrupting column headers", async () => {
    const csvContent = ["roll_no,first_name,last_name,gender", "250001,BOM_Student,One,M"].join(
      "\n",
    );

    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const utf8Buffer = Buffer.concat([bom, Buffer.from(csvContent, "utf8")]);

    const preview = await validatePatronCsv(
      utf8Buffer,
      "STUDENT",
      { fileName: "bom_students.csv" },
      db,
    );

    expect(preview.summary.totalRows).toBe(1);
    expect(preview.summary.okCount).toBe(1);
    expect(preview.rows[0].data?.rollNo).toBe("250001");
    expect(preview.rows[0].data?.firstName).toBe("BOM_Student");
  });

  it("3. Recovers gracefully from malformed CSV with unclosed quotes, irregular columns, and empty lines", async () => {
    const malformedCsv = [
      "roll_no,first_name,last_name",
      "",
      "250002,Normal,Student",
      "   ",
      '250003,"Unclosed Quote,Student',
      "250004,Too,Many,Extra,Columns,Here",
      "",
    ].join("\n");

    const buffer = Buffer.from(malformedCsv, "utf8");
    const preview = await validatePatronCsv(buffer, "STUDENT", { fileName: "malformed.csv" }, db);

    // Empty lines are skipped, valid rows parsed
    expect(preview.summary.totalRows).toBeGreaterThanOrEqual(3);
    const validRows = preview.rows.filter((r) => r.status === "OK");
    expect(validRows.length).toBeGreaterThanOrEqual(1);
    expect(validRows.some((r) => r.data?.rollNo === "250002")).toBe(true);
  });

  it("4. Large-File Test: processes >= 150 rows meeting throughput requirement of >= 100 rows/second (NFR-P-03)", async () => {
    const lines = ["roll_no,first_name,last_name,gender,dob,department,year,semester,mobile,email"];

    for (let i = 1; i <= 150; i++) {
      const roll = `99000${i.toString().padStart(3, "0")}`;
      lines.push(
        `${roll},Student${i},Batch2026,M,01-01-2004,CSE,1,1,9800000${i.toString().padStart(3, "0")},stu${i}@rbmi.in`,
      );
    }

    const largeCsv = lines.join("\n");
    const largeBuffer = Buffer.from(largeCsv, "utf8");

    const startTime = performance.now();
    const preview = await validatePatronCsv(
      largeBuffer,
      "STUDENT",
      { fileName: "large_student_roster.csv" },
      db,
    );
    const durationMs = performance.now() - startTime;

    expect(preview.summary.totalRows).toBe(150);
    expect(preview.summary.okCount).toBe(150);
    expect(preview.summary.errorCount).toBe(0);

    const throughput = (150 / durationMs) * 1000;
    // Expected throughput >= 100 rows/second per NFR-P-03
    expect(throughput).toBeGreaterThanOrEqual(100);
  });
});
