import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/crypto";

describe("Argon2id Password Security", () => {
  it("hashes password and verifies successfully", () => {
    const password = "Admin@123";
    const hash = hashPassword(password);

    expect(hash).toContain("$argon2id$");
    expect(verifyPassword(password, hash)).toBe(true);
    expect(verifyPassword("WrongPassword", hash)).toBe(false);
  });

  it("produces unique salt/nonce for identical passwords", () => {
    const hash1 = hashPassword("Lib@123");
    const hash2 = hashPassword("Lib@123");

    expect(hash1).not.toBe(hash2);
    expect(verifyPassword("Lib@123", hash1)).toBe(true);
    expect(verifyPassword("Lib@123", hash2)).toBe(true);
  });
});
