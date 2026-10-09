import crypto from "node:crypto";
import { generateRandomToken } from "./crypto";

export const CSRF_HEADER_NAME = "x-csrf-token";
export const CSRF_FORM_FIELDS = ["_csrf", "csrf_token"] as const;

/**
 * Generates a random CSRF token
 */
export function generateCsrfToken(): string {
  return generateRandomToken(32);
}

/**
 * Validates a submitted CSRF token against the session's expected CSRF token
 * using timing-safe comparison.
 */
export function validateCsrfToken(
  expectedToken: string | null | undefined,
  providedToken: string | null | undefined,
): boolean {
  if (!expectedToken || !providedToken) {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedToken);
  const providedBuffer = Buffer.from(providedToken);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}
