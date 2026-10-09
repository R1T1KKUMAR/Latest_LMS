import crypto from "node:crypto";

const ARGON2_CONFIG = {
  parallelism: 1,
  tagLength: 32,
  memory: 19456, // 19 MiB
  passes: 2,
};

/**
 * Hashes a plaintext password using Argon2id
 */
export function hashPassword(password: string): string {
  const nonce = crypto.randomBytes(16);
  const hash = crypto.argon2Sync("argon2id", {
    message: password,
    nonce,
    ...ARGON2_CONFIG,
  });

  return `$argon2id$v=19$m=${ARGON2_CONFIG.memory},t=${ARGON2_CONFIG.passes},p=${ARGON2_CONFIG.parallelism}$${nonce.toString("base64")}$${hash.toString("base64")}`;
}

/**
 * Verifies a plaintext password against an Argon2id hash
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split("$");
    if (parts.length !== 6 || parts[1] !== "argon2id") {
      return false;
    }

    const nonce = Buffer.from(parts[4], "base64");
    const expectedHash = Buffer.from(parts[5], "base64");

    const computed = crypto.argon2Sync("argon2id", {
      message: password,
      nonce,
      ...ARGON2_CONFIG,
    });

    return crypto.timingSafeEqual(computed, expectedHash);
  } catch {
    return false;
  }
}

/**
 * Generates a cryptographically secure random hexadecimal token
 */
export function generateRandomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}
