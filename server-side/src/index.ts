/**
 * Server entry point.
 *
 * Boots an Express app that hosts HTTP endpoints (auth, rooms) and a
 * Socket.IO server for realtime sync (join-request notifications, etc.).
 * Runs as a long-lived process — not serverless — because sockets need a
 * persistent connection.
 *
 * Architecture note: Socket.IO needs the underlying `http.Server` (not
 * the Express `app` object), so we explicitly wrap the app and call
 * `.listen()` on the server. Same port, same CORS origin — both
 * transports share infrastructure.
 */

// Loads variables from `.env` into `process.env`. Must run before any module
// that reads env values (Prisma client, mailer transporter, JWT signer, etc.).
import "dotenv/config";
import http from "node:http";
import express from "express";
import cors from "cors";
import { authRouter } from "./auth/router";
import { startStagedUserCleanupCron } from "./auth/cleanupCron";
import { roomsRouter } from "./rooms/router";
import { startStaleRoomCleanupCron } from "./rooms/cleanupCron";
import { attachWsServer } from "./ws";

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

// Room routes: /rooms/create (more to follow). Every route under here is
// guarded by requireAuth — see rooms/router.ts.
app.use("/rooms", roomsRouter);

// Wrap Express in an http.Server so Socket.IO can attach to the same
// listener. Both transports share `PORT` and `corsOrigin`.
const httpServer = http.createServer(app);
attachWsServer(httpServer, corsOrigin);

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  startStagedUserCleanupCron();
  startStaleRoomCleanupCron();
});
