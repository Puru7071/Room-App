/**
 * In-memory store of pending video-add requests — the parallel
 * mechanism to `joinRequests.ts` for the broadcaster carousel. When
 * `editAccess === "LIMITED"`, non-leader add attempts via the top bar
 * land here instead of going straight into the queue, and the leader
 * approves/rejects via WS.
 *
 * Requests live for 3 minutes; sweeper evicts expired rows. No DB
 * persistence — restart wipes pending requests by design.
 *
 * Public surface mirrors joinRequests.ts:
 *   addAddRequest(roomId, user, videoId)  — dedup-aware insert
 *   listAddRequestsForRoom(roomId)        — open requests for one room
 *   findAddRequest(requestId)             — locate by id (linear)
 *   removeAddRequest(requestId)           — remove + return the row
 *   startAddRequestSweeper(io)            — periodic TTL eviction
 */

import type { Server as IOServer } from "socket.io";
import { randomUUID } from "node:crypto";
import type { VideoAddRequestWire } from "./types";

/** 3 minutes in milliseconds. */
export const VIDEO_ADD_REQUEST_TTL_MS = 3 * 60 * 1000;
/** How often the sweeper wakes to evict expired rows. */
const SWEEP_INTERVAL_MS = 30 * 1000;

type StoredAddRequest = {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  videoId: string;
  createdAt: number;
  expiresAt: number;
};

const requestsByRoom = new Map<string, StoredAddRequest[]>();

function toWire(r: StoredAddRequest): VideoAddRequestWire {
  return {
    id: r.id,
    roomId: r.roomId,
    userId: r.userId,
    userName: r.userName,
    videoId: r.videoId,
    createdAt: new Date(r.createdAt).toISOString(),
    expiresAt: new Date(r.expiresAt).toISOString(),
  };
}

/**
 * Insert a request, deduping by `(roomId, userId, videoId)`: if the
 * same user already has a pending add for the same video in the same
 * room, return the existing row. Prevents accidental request spam if
 * the user clicks add twice.
 */
export function addAddRequest(
  roomId: string,
  user: { userId: string; userName: string },
  videoId: string,
): VideoAddRequestWire {
  const list = requestsByRoom.get(roomId) ?? [];
  const existing = list.find(
    (r) => r.userId === user.userId && r.videoId === videoId,
  );
  if (existing) return toWire(existing);

  const now = Date.now();
  const stored: StoredAddRequest = {
    id: randomUUID(),
    roomId,
    userId: user.userId,
    userName: user.userName,
    videoId,
    createdAt: now,
    expiresAt: now + VIDEO_ADD_REQUEST_TTL_MS,
  };
  list.push(stored);
  requestsByRoom.set(roomId, list);
  return toWire(stored);
}

export function listAddRequestsForRoom(roomId: string): VideoAddRequestWire[] {
  const list = requestsByRoom.get(roomId);
  if (!list) return [];
  return list.map(toWire);
}

export function findAddRequest(requestId: string): {
  roomId: string;
  userId: string;
  userName: string;
  videoId: string;
} | null {
  for (const [, list] of requestsByRoom) {
    const found = list.find((r) => r.id === requestId);
    if (found) {
      return {
        roomId: found.roomId,
        userId: found.userId,
        userName: found.userName,
        videoId: found.videoId,
      };
    }
  }
  return null;
}

export function removeAddRequest(requestId: string): {
  roomId: string;
  userId: string;
  userName: string;
  videoId: string;
} | null {
  for (const [roomId, list] of requestsByRoom) {
    const idx = list.findIndex((r) => r.id === requestId);
    if (idx >= 0) {
      const [removed] = list.splice(idx, 1);
      if (list.length === 0) requestsByRoom.delete(roomId);
      return {
        roomId,
        userId: removed.userId,
        userName: removed.userName,
        videoId: removed.videoId,
      };
    }
  }
  return null;
}

/**
 * Sweep expired rows and emit `room.add-request.expired` to both the
 * room channel (leader's panel filters the card) and the requester's
 * personal channel. Started once at boot from `attachWsServer`.
 */
export function startAddRequestSweeper(io: IOServer) {
  setInterval(() => {
    const now = Date.now();
    for (const [roomId, list] of requestsByRoom) {
      const remaining: StoredAddRequest[] = [];
      const expired: StoredAddRequest[] = [];
      for (const r of list) {
        if (r.expiresAt <= now) expired.push(r);
        else remaining.push(r);
      }
      if (expired.length === 0) continue;
      if (remaining.length === 0) requestsByRoom.delete(roomId);
      else requestsByRoom.set(roomId, remaining);
      for (const r of expired) {
        io.to(`room:${roomId}`).emit("room.add-request.expired", {
          requestId: r.id,
          roomId,
        });
        io.to(`user:${r.userId}`).emit("room.add-request.expired", {
          requestId: r.id,
          roomId,
        });
      }
    }
  }, SWEEP_INTERVAL_MS).unref?.();
}
