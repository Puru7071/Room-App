/**
 * Server entry point.
 *
 * Boots an Express app that will host HTTP endpoints (auth, rooms, etc.) and,
 * later, socket.io for realtime sync. Runs as a long-lived process — not
 * serverless — because sockets need a persistent connection.
 */

// Loads variables from `.env` into `process.env`. Must run before any module
// that reads env values (Prisma client, mailer transporter, JWT signer, etc.).
import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./auth/router";
import { startStagedUserCleanupCron } from "./auth/cleanupCron";

/** HTTP port. Defaults to 9900 for local dev; overridable via `PORT` env var. */
const PORT = Number(process.env.PORT ?? 9900);

/** `true` when deployed; flips CORS policy from the lenient dev regex to exact-match. */
const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Allowed origin(s) for browser requests.
 *
 * Dev: any `http://localhost:<port>` passes — Next.js often swaps ports
 * (3000/3001/…), so an exact match would be brittle.
 * Prod: require `WEB_ORIGIN` to be set and use it as an exact-match string,
 * failing loudly at boot if unset so we never ship a wide-open server.
 */
const corsOrigin: RegExp | string = IS_PROD
  ? (process.env.WEB_ORIGIN ??
      (() => {
        throw new Error("WEB_ORIGIN must be set in production");
      })())
  : /^http:\/\/localhost:\d+$/;

const app = express();

// Middleware order matters: CORS must run first so preflight OPTIONS requests
// are answered before any route handler sees them.
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

/** Liveness probe. Used by load balancers / uptime monitors / local curl checks. */
app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Auth routes: /auth/signup, /auth/verify-otp. Rate limiters are attached
// inside the router so only auth traffic is throttled, not /health etc.
app.use("/auth", authRouter);

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
