/**
 * POST /auth/verify-otp — step 2 of the staged-signup flow.
 *
 * Matches the submitted `{ email, otp }` against the `StagedUser` row that
 * `/auth/signup` created. On match, promotes the staged row into a permanent
 * `User` inside a single transaction and returns a JWT.
 *
 *   StagedUser(email,otp,…) ──► User(email,username,passwordHash,…)  ⇒  JWT
 *                            └► (staged row deleted)
 *
 * Response:
 *   200 { ok: true, token, user: { userId, email, username, profilePicUrl } }
 *   400 { ok: false, error, field?, reason? }  // bad code / expired / malformed body
 *
 * `reason` is "invalid" for a code mismatch (or unknown email) and "expired"
 * for a stored row whose `expiresAt` has passed. The client uses this to
 * route expired into a toast (so the user understands they need a fresh code,
 * not a retry) and invalid into the inline error slot (the user can just
 * retype the digits). Both `expiresAt` is stored in UTC (Postgres timestamptz)
 * and compared against `new Date()` (a UTC moment), so the check is timezone-
 * agnostic.
 */

import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db";
import { verifyOtpSchema } from "./schemas";

/** JWT lifetime. Matches the Instagram-clone pattern we ported from. */
const JWT_EXPIRES_IN = "7d";

export async function verifyOtpHandler(req: Request, res: Response) {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path[0] as "email" | "otp" | undefined;
    return res.status(400).json({ ok: false, error: issue.message, field });
  }

  const { email, otp } = parsed.data;

  // Read before verifying secrets so an unset JWT_SECRET surfaces at boot-ish
  // time in dev (first verify call) rather than silently signing with "".
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error("[auth/verify-otp] JWT_SECRET is not set");
    return res.status(500).json({ ok: false, error: "Server misconfigured." });
  }

  const staged = await prisma.stagedUser.findUnique({ where: { email } });

  // Same response for "no row" and "wrong code" so an attacker can't probe
  // which emails have pending signups.
  if (!staged || staged.otp !== otp) {
    return res.status(400).json({
      ok: false,
      error: "That code doesn't match. Double-check and try again.",
      field: "otp",
      reason: "invalid",
    });
  }

  // `staged.expiresAt` is a UTC moment (column is `timestamptz`); `new Date()`
  // is also a UTC moment. The comparison is timezone-agnostic.
  if (staged.expiresAt <= new Date()) {
    // Sweep the expired row so the client's retry path re-runs `/auth/signup`
    // cleanly instead of colliding on the unique-email constraint.
    await prisma.stagedUser.delete({ where: { email } }).catch(() => {});
    return res.status(400).json({
      ok: false,
      error: "That code expired. Start again to get a new one.",
      field: "otp",
      reason: "expired",
    });
  }

  // Atomically promote staged → user. If the `User.create` fails (e.g. a
  // race where another email completed signup with the same username between
  // signup + verify), the delete is rolled back and the staged row stays put.
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: staged.email,
        username: staged.username,
        password: staged.password,
        profilePicUrl: staged.profilePicUrl,
      },
      select: {
        userId: true,
        email: true,
        username: true,
        profilePicUrl: true,
      },
    });
    await tx.stagedUser.delete({ where: { email } });
    return created;
  });

  const token = jwt.sign(
    { userId: user.userId, username: user.username },
    jwtSecret,
    { expiresIn: JWT_EXPIRES_IN },
  );

  return res.status(200).json({ ok: true, token, user });
}
