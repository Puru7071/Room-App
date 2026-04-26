/**
 * Validation rules + error copy for the auth gate. Mirrors the server-side
 * Zod schemas in `server-side/src/auth/schemas.ts` so client and server agree
 * on what's a valid email/username/password.
 */

export const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Length of the OTP — matches the 6-digit generator in `server-side/src/auth/otp.ts`. */
export const OTP_LENGTH = 6;

export const EMAIL_INVALID_MSG = "Enter a valid email address.";
export const USERNAME_RULE_MSG = "Use 3–30 letters, numbers, or underscores.";
export const PASSWORD_MIN_MSG = "Use at least 6 characters.";
export const PASSWORD_REQUIRED_MSG = "Enter your password.";
export const OTP_INCOMPLETE_MSG = "Enter the 6-digit code.";

/**
 * Trims, lowercases, and strips invalid characters from a username, then
 * returns the normalized form if it satisfies `USERNAME_RE`. Returns `null`
 * when the input can't be coerced into a valid username.
 */
export function normalizeUsername(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (s.length < 3 || s.length > 30) return null;
  if (!USERNAME_RE.test(s)) return null;
  return s;
}
