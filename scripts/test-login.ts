import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../db/schema";
import { loginPatron, loginStaff } from "../services/auth";

async function main() {
  const dbDir = path.resolve(process.cwd(), "data/lms-db");
  const pg = new PGlite(dbDir);
  const testDb = drizzle(pg, { schema });

  console.log("Testing staff login (Admin)...");
  const adminRes = await loginStaff({ username: "admin", password: "Admin@123" }, testDb);
  console.log("Admin result:", {
    success: adminRes.success,
    username: adminRes.user?.username,
    role: adminRes.user?.roleCode,
  });

  console.log("Testing staff login (Librarian)...");
  const libRes = await loginStaff({ username: "librarian", password: "Lib@123" }, testDb);
  console.log("Librarian result:", {
    success: libRes.success,
    username: libRes.user?.username,
    role: libRes.user?.roleCode,
  });

  console.log("Testing staff login (Assistant)...");
  const asstRes = await loginStaff({ username: "assistant", password: "Asst@123" }, testDb);
  console.log("Assistant result:", {
    success: asstRes.success,
    username: asstRes.user?.username,
    role: asstRes.user?.roleCode,
  });

  console.log("Testing patron login (Rahul Kumar)...");
  const patronRes = await loginPatron(
    { identifier: "2301430100045", password: "2301430100045" },
    testDb,
  );
  console.log("Patron result:", {
    success: patronRes.success,
    name: patronRes.patron?.name,
    cardNo: patronRes.patron?.cardNo,
  });

  await pg.close();
}

main().catch(console.error);
