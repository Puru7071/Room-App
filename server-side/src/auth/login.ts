/**
 * POST /auth/login — authenticate a returning user.
 *
 * Mirrors the JWT issuance that `verify-otp` does for new signups: looks up
 * the User by email, runs `bcrypt.compare` against the stored hash, and on
 * match returns `{ ok: true, token, user }`. Mismatch (or unknown email)
 * returns a single generic error so an attacker can't probe which emails
 * are registered.
 *
 * Response:
 *   200 { ok: true, token, user: { userId, email, username, profilePicUrl } }
 *   400 { ok: false, error }              // bad credentials (uniform message)
 *   400 { ok: false, error, field }       // malformed body (Zod field error)
 *   500 { ok: false, error }              // JWT_SECRET unset
 */

import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../db";
import { loginSchema } from "./schemas";

/** JWT lifetime — same as verify-otp issues so the two paths are interchangeable. */
const JWT_EXPIRES_IN = "7d";

/** Generic copy used for both "no such email" and "wrong password" so an
 *  attacker can't tell which side of the check failed. */
const GENERIC_BAD_CREDENTIALS = "Email or password is incorrect.";

export async function loginHandler(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path[0] as "email" | "password" | undefined;
    return res.status(400).json({ ok: false, error: issue.message, field });
  }

  const { email, password } = parsed.data;

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error("[auth/login] JWT_SECRET is not set");
    return res.status(500).json({ ok: false, error: "Server misconfigured." });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      userId: true,
      email: true,
      username: true,
      profilePicUrl: true,
      password: true,
    },
  });

  // Run bcrypt.compare even when the user wasn't found — comparing against a
  // dummy hash keeps the response time roughly constant so timing analysis
  // can't distinguish "no user" from "wrong password."
  const passwordHash =
    user?.password ??
    "$2b$10$invalidplaceholderhashinvalidplaceholderhashinvalidplaceholderha";
  const passwordOk = await bcrypt.compare(password, passwordHash);

  if (!user || !passwordOk) {
    return res.status(400).json({ ok: false, error: GENERIC_BAD_CREDENTIALS });
  }

  const token = jwt.sign(
    { userId: user.userId, username: user.username },
    jwtSecret,
    { expiresIn: JWT_EXPIRES_IN },
  );

  return res.status(200).json({
    ok: true,
    token,
    user: {
      userId: user.userId,
      email: user.email,
      username: user.username,
      profilePicUrl: user.profilePicUrl,
    },
  });
}
