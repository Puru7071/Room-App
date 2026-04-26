/**
 * /auth router — assembles the signup, verify-otp, and login routes plus
 * their per-route rate limiters.
 *
 * Rate limits are deliberately tighter on signup (triggers an email send,
 * which is expensive + abusable) than on verify-otp (cheap DB read).
 * Login is throttled at the same shape as verify-otp — the bcrypt.compare
 * is cheap on a per-call basis but doubles as a brake on credential-stuffing.
 */

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { loginHandler } from "./login";
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

const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many login attempts. Try again shortly." },
});

export const authRouter = Router();

authRouter.post("/signup", signupLimiter, signupHandler);
authRouter.post("/verify-otp", verifyLimiter, verifyOtpHandler);
authRouter.post("/login", loginLimiter, loginHandler);
