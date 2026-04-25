/**
 * /auth router — assembles the signup + verify-otp routes plus their
 * per-route rate limiters.
 *
 * Rate limits are deliberately tighter on signup (triggers an email send,
 * which is expensive + abusable) than on verify-otp (cheap DB read).
 * The verify cap is still tight enough to block brute-forcing a 6-digit code:
 * 10 per minute × 2-minute expiry = 20 attempts to guess 1 of 10⁶ — trivial
 * to bound statistically.
 */

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { signupHandler } from "./signup";
import { verifyOtpHandler } from "./verifyOtp";

const signupLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many signup attempts. Try again shortly." },
});

const verifyLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many attempts. Try again shortly." },
});

export const authRouter = Router();

authRouter.post("/signup", signupLimiter, signupHandler);
authRouter.post("/verify-otp", verifyLimiter, verifyOtpHandler);
