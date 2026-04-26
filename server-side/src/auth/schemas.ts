/**
 * Zod request schemas for the auth routes.
 *
 * Kept in one file so the validation rules for signup + verify stay side-by-side
 * and the same regexes/min-lengths are consistent with the client-side form.
 */

import { z } from "zod";

/** Matches the client's `USERNAME_RE` in `AuthGateForms.tsx`. */
export const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_RE, "Use 3–30 letters, numbers, or underscores."),
  password: z.string().min(6, "Use at least 6 characters."),
});

export const verifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

/**
 * Login uses email + password. We don't enforce a minimum length on the
 * password here (that's a signup-time rule) — login just needs the field
 * to be present so we can hand it to bcrypt.compare. Mismatch returns a
 * generic "email or password is incorrect" so we don't leak which emails
 * exist in the User table.
 */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, "Enter your password."),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
