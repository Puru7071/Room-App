/**
 * Cryptographically-random 6-digit OTP generator.
 *
 * `crypto.randomInt` is a uniformly-random integer from Node's built-in CSPRNG
 * — safer than `Math.random` (predictable) for something that gates account
 * creation. `padStart` keeps leading-zero codes (e.g. "004219") at the full
 * six characters instead of "4219".
 */

import { randomInt } from "node:crypto";

/** How long the OTP row lives in `StagedUser` before the verify route rejects it. */
export const OTP_TTL_MINUTES = 2;

export function generateOTP(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Timestamp to stamp onto `StagedUser.expiresAt` when creating the row. */
export function otpExpiresAt(): Date {
  return new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
}
