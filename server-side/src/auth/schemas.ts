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

export type SignupInput = z.infer<typeof signupSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
