import { loginPatron, loginStaff } from "../services/auth";

async function verifyLogins() {
  console.log("Verifying staff login through default db client...");
  const adminRes = await loginStaff({ username: "admin", password: "Admin@123" });
  console.log("Admin login:", { success: adminRes.success, user: adminRes.user?.username });

  const patronRes = await loginPatron({ identifier: "2301430100045", password: "2301430100045" });
  console.log("Patron login:", { success: patronRes.success, patron: patronRes.patron?.name });
}

verifyLogins().catch(console.error);
