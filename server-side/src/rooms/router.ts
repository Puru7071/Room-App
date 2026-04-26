/**
 * /rooms router — assembles room-management endpoints.
 *
 * Every route under `/rooms/*` is authenticated; `requireAuth` is part of
 * each route's middleware chain. Per-route rate limiters use the same
 * shape as the auth router (loginLimiter / verifyLimiter).
 *
 * Order matters: limiter first (cheaper to reject), then `requireAuth`,
 * then the handler.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../auth/requireAuth";
import { createRoomHandler } from "./createRoom";
import { deleteRoomHandler } from "./deleteRoom";
import { getRoomHandler } from "./getRoom";
import { joinRoomHandler } from "./joinRoom";
import { myRoomsHandler } from "./myRooms";
import { addToQueueHandler } from "./queue/addToQueue";
import { getQueueHandler } from "./queue/getQueue";
import { updateSettingsHandler } from "./updateSettings";

const createRoomLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many room creations. Try again shortly.",
  },
});

// Reads are cheap (single indexed lookup), so the limiter is loose enough
// that page loads + occasional refreshes never trip it.
const getRoomLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests. Try again shortly." },
});

// Settings flips are user-driven (toggle clicks), so a moderate cap is
// plenty. Higher than create (10/min) since one owner might fiddle with
// several toggles in a minute; lower than read.
const updateSettingsLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many setting changes. Try again shortly." },
});

// "My rooms" list is loaded each time the popover opens — same shape as a
// page load, so reuse the read budget.
const myRoomsLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests. Try again shortly." },
});

const deleteRoomLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many room deletions. Try again shortly." },
});

// Joins are page-load triggered (one POST per room visit), so the cap
// allows a healthy navigation rate without trip-wiring legitimate use.
const joinRoomLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many join attempts. Try again shortly." },
});

// Queue reads happen once per page load + once per WS reconnect — same
// budget as getRoom.
const getQueueLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests. Try again shortly." },
});

// Queue adds are user-driven (paste / search-pick); a moderate cap is
// plenty without blocking burst-add behavior.
const addToQueueLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many queue additions. Try again shortly." },
});

export const roomsRouter = Router();

roomsRouter.post(
  "/create",
  createRoomLimiter,
  requireAuth,
  createRoomHandler,
);

// `/mine` MUST be declared before `/:roomId` — otherwise Express matches
// `mine` as the roomId param and routes the request to `getRoom`, which
// 404s. Specific paths first, parameterized last.
roomsRouter.get("/mine", myRoomsLimiter, requireAuth, myRoomsHandler);

roomsRouter.get("/:roomId", getRoomLimiter, requireAuth, getRoomHandler);

roomsRouter.patch(
  "/:roomId/settings",
  updateSettingsLimiter,
  requireAuth,
  updateSettingsHandler,
);

roomsRouter.delete(
  "/:roomId",
  deleteRoomLimiter,
  requireAuth,
  deleteRoomHandler,
);

roomsRouter.post(
  "/:roomId/join",
  joinRoomLimiter,
  requireAuth,
  joinRoomHandler,
);

roomsRouter.get(
  "/:roomId/queue",
  getQueueLimiter,
  requireAuth,
  getQueueHandler,
);

roomsRouter.post(
  "/:roomId/queue",
  addToQueueLimiter,
  requireAuth,
  addToQueueHandler,
);
