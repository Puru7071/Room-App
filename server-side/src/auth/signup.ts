/**
 * POST /auth/signup — step 1 of the staged-signup flow.
 *
 *   ┌───────────┐     ┌───────────┐      ┌──────────────┐
 *   │  client   │ ──► │  signup   │ ───► │  StagedUser  │
 *   │ (form UI) │     │  handler  │      │  (TTL: 2min) │
 *   └───────────┘     └─────┬─────┘      └──────────────┘
 *                           │
 *                           └─► sendOTPEmail(email, otp)
 *
 * Body: `{ email, username, password }` (see `signupSchema`).
 * Response: `200 { ok: true }` on success; `4xx { ok: false, error, field? }`
 * on any validation/conflict failure so the client can map `field` back to the
 * corresponding input error slot.
 */

import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../db";
import { sendOTPEmail } from "../mailer/sendOTPEmail";
import { signupSchema } from "./schemas";
import { generateOTP, OTP_TTL_MINUTES, otpExpiresAt } from "./otp";

/** bcrypt work factor. 10 is Node's default; ~80ms per hash on modern hardware. */
const BCRYPT_ROUNDS = 10;

export async function signupHandler(req: Request, res: Response) {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path[0] as "email" | "username" | "password" | undefined;
    return res.status(400).json({ ok: false, error: issue.message, field });
  }

  const { email, username, password } = parsed.data;

  // 1) Reject if a completed `User` already claims this email or username.
  //    We check both in a single query via OR so one round-trip covers both.
  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existingUser) {
    const field = existingUser.email === email ? "email" : "username";
    return res.status(409).json({
      ok: false,
      error: `That ${field} is already in use.`,
      field,
    });
  }

  // 2) Housekeeping — sweep any expired staged rows so they don't hold a
  //    unique-username slot. Cheap because `expiresAt` is indexed.
  await prisma.stagedUser.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  // 3) If a *different* email has this username staged and is still active,
  //    reject. (A staged row under the same email is fine — we'll overwrite it
  //    in step 5.)
  const stagedUsernameOwner = await prisma.stagedUser.findUnique({
    where: { username },
  });
  if (stagedUsernameOwner && stagedUsernameOwner.email !== email) {
    return res.status(409).json({
      ok: false,
      error: "That username is already in use.",
      field: "username",
    });
  }

  // 4) Hash + fresh OTP.
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const otp = generateOTP();
  const expiresAt = otpExpiresAt();

  // 5) Upsert keyed by email so hitting the endpoint again (user mistyped the
  //    OTP, bounced back, retried) refreshes the code instead of 409-ing.
  await prisma.stagedUser.upsert({
    where: { email },
    update: { username, password: passwordHash, otp, expiresAt },
    create: { email, username, password: passwordHash, otp, expiresAt },
  });

  // 6) Ship the email. If SMTP blows up, roll back the staged row so the next
  //    retry isn't blocked by a row the user never received a code for.
  try {
    await sendOTPEmail({ email, otp, expiresInMinutes: OTP_TTL_MINUTES });
  } catch (err) {
    await prisma.stagedUser.delete({ where: { email } }).catch(() => {});
    console.error("[auth/signup] sendOTPEmail failed:", err);
    return res.status(502).json({
      ok: false,
      error: "We couldn't send the verification email. Try again in a moment.",
    });
  }

  return res.status(200).json({ ok: true });
}
