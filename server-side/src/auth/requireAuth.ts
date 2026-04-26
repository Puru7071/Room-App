/**
 * JWT-verifying middleware for routes that must be reached only by an
 * authenticated user.
 *
 * Reads the bearer token from `Authorization`, verifies it against
 * `JWT_SECRET`, and attaches `req.user = { userId, username }` so handlers
 * can `req.user!.userId` without re-parsing. Any failure path — missing
 * header, malformed token, expired token, payload missing fields —
 * resolves to 401 with a generic JSON error so the client can react
 * uniformly (its `postJsonAuth` helper clears the token + drops the user
 * back to the gate on 401).
 *
 * Server-misconfigured cases (`JWT_SECRET` unset) return 500 instead of
 * 401 so the client doesn't mistake an ops issue for a credentials issue.
 */
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.header("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "Authentication required." });
  }
  const token = auth.slice("Bearer ".length).trim();

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error("[requireAuth] JWT_SECRET is not set");
    return res.status(500).json({ ok: false, error: "Server misconfigured." });
  }

  try {
    const payload = jwt.verify(token, secret) as {
      userId?: unknown;
      username?: unknown;
    };
    if (
      typeof payload.userId !== "string" ||
      typeof payload.username !== "string"
    ) {
      return res.status(401).json({ ok: false, error: "Invalid token." });
    }
    req.user = { userId: payload.userId, username: payload.username };
    next();
  } catch {
    return res
      .status(401)
      .json({ ok: false, error: "Invalid or expired token." });
  }
}
