/**
 * In-memory store of pending join requests, plus the WS handlers that
 * mutate it. Requests live for 3 minutes and are wiped on TTL expiry,
 * approval, or rejection. **No DB persistence.** A server restart
 * forfeits open requests by design — they're transient signals.
 *
 * The store is a `Map<roomId, JoinRequest[]>`. Lookup by `requestId`
 * scans all rooms (linear in total open requests, fine at this scale).
 *
 * Public surface:
 *   addRequest(roomId, user)     — dedup-aware insert
 *   listForRoom(roomId)          — open requests for one room
 *   findRequest(requestId)       — locate by id (linear)
 *   removeRequest(requestId)     — remove + return the row
 *   startSweeper(io)             — periodic TTL eviction
 */

import type { Server as IOServer } from "socket.io";
import { randomUUID } from "node:crypto";
import type { JoinRequestWire } from "./types";

/** 3 minutes in milliseconds. */
export const JOIN_REQUEST_TTL_MS = 3 * 60 * 1000;
/** How often the sweeper wakes to evict expired rows. */
const SWEEP_INTERVAL_MS = 30 * 1000;

type StoredRequest = {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  createdAt: number; // ms epoch
  expiresAt: number; // ms epoch
};

const requestsByRoom = new Map<string, StoredRequest[]>();

function toWire(r: StoredRequest): JoinRequestWire {
  return {
    id: r.id,
    roomId: r.roomId,
    userId: r.userId,
    userName: r.userName,
    createdAt: new Date(r.createdAt).toISOString(),
    expiresAt: new Date(r.expiresAt).toISOString(),
  };
}

/**
 * Insert a request, deduping by `(roomId, userId)`: if the same user
 * already has a pending request for the same room, return the existing
 * row instead of creating a second one. The leader sees one request per
 * person regardless of how many times they retry.
 */
export function addRequest(
  roomId: string,
  user: { userId: string; username: string },
): JoinRequestWire {
  const list = requestsByRoom.get(roomId) ?? [];
  const existing = list.find((r) => r.userId === user.userId);
  if (existing) return toWire(existing);

  const now = Date.now();
  const stored: StoredRequest = {
    id: randomUUID(),
    roomId,
    userId: user.userId,
    userName: user.username,
    createdAt: now,
    expiresAt: now + JOIN_REQUEST_TTL_MS,
  };
  list.push(stored);
  requestsByRoom.set(roomId, list);
  return toWire(stored);
}

export function listForRoom(roomId: string): JoinRequestWire[] {
  const list = requestsByRoom.get(roomId);
  if (!list) return [];
  return list.map(toWire);
}

export function findRequest(
  requestId: string,
): { roomId: string; userId: string; userName: string } | null {
  for (const [roomId, list] of requestsByRoom) {
    const found = list.find((r) => r.id === requestId);
    if (found) {
      return {
        roomId,
        userId: found.userId,
        userName: found.userName,
      };
    }
    void roomId;
  }
  return null;
}

export function removeRequest(
  requestId: string,
): { roomId: string; userId: string; userName: string } | null {
  for (const [roomId, list] of requestsByRoom) {
    const idx = list.findIndex((r) => r.id === requestId);
    if (idx >= 0) {
      const [removed] = list.splice(idx, 1);
      if (list.length === 0) requestsByRoom.delete(roomId);
      return {
        roomId,
        userId: removed.userId,
        userName: removed.userName,
      };
    }
  }
  return null;
}

/**
 * Sweep expired rows and emit `room.request.expired` to the leader's
 * personal channel + the requester's personal channel so both UIs
 * reconcile. Started once at boot from `attachWsServer`.
 */
export function startSweeper(io: IOServer) {
  setInterval(() => {
    const now = Date.now();
    for (const [roomId, list] of requestsByRoom) {
      const remaining: StoredRequest[] = [];
      const expired: StoredRequest[] = [];
      for (const r of list) {
        if (r.expiresAt <= now) expired.push(r);
        else remaining.push(r);
      }
      if (expired.length === 0) continue;
      if (remaining.length === 0) requestsByRoom.delete(roomId);
      else requestsByRoom.set(roomId, remaining);
      // Broadcast each expiry. Cheap; expired count per sweep is tiny.
      for (const r of expired) {
        io.to(`room:${roomId}`).emit("room.request.expired", {
          requestId: r.id,
          roomId,
        });
        io.to(`user:${r.userId}`).emit("room.request.expired", {
          requestId: r.id,
          roomId,
        });
      }
    }
  }, SWEEP_INTERVAL_MS).unref?.();
}
