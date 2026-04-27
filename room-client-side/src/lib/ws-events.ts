/**
 * Wire shapes for the WS messages this app exchanges. Mirrors the
 * server's `src/ws/types.ts`. Keep both files in sync — there's no
 * shared package in this monorepo.
 */

import type { RoomDetail } from "@/lib/api";

export type JoinRequestWire = {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  /** ISO-8601. */
  createdAt: string;
  expiresAt: string;
};

export type RequestListPayload = {
  roomId: string;
  requests: JoinRequestWire[];
};

export type RequestCreatedPayload = { request: JoinRequestWire };

export type RequestExpiredPayload = { requestId: string; roomId: string };

export type RequestApprovedPayload = {
  requestId: string;
  room: RoomDetail;
};

export type RequestRejectedPayload = { requestId: string; roomId: string };

/**
 * Broadcast on the `room:` channel for both approve and reject — the
 * leader's panel listens to this to filter the card. Decoupled from
 * the user-targeted `approved`/`rejected` events to avoid the dual-
 * broadcast duplicate-toast bug.
 */
export type RequestRemovedPayload = { requestId: string; roomId: string };

export type MemberJoinedPayload = {
  roomId: string;
  userId: string;
  userName: string;
};

/**
 * Broadcast on the `room:` channel after a successful queue add. The
 * sender receives this too — single source of truth for "append this
 * to the local reducer". Mirrors the server's `QueueItemWire`.
 */
export type QueueAddedPayload = {
  item: {
    id: string;
    videoId: string;
    addedById: string;
    addedByName: string;
    addedAt: string;
    position: number;
  };
};

/* ------------------------------------------------------------------ */
/* Video-add requests (broadcaster carousel companion)                 */
/* ------------------------------------------------------------------ */

export type VideoAddRequestWire = {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  videoId: string;
  /** ISO-8601. */
  createdAt: string;
  expiresAt: string;
};

export type AddRequestListPayload = {
  roomId: string;
  requests: VideoAddRequestWire[];
};
export type AddRequestCreatedPayload = { request: VideoAddRequestWire };
export type AddRequestExpiredPayload = { requestId: string; roomId: string };
export type AddRequestApprovedPayload = {
  requestId: string;
  roomId: string;
  videoId: string;
};
export type AddRequestRejectedPayload = {
  requestId: string;
  roomId: string;
  videoId: string;
};
export type AddRequestRemovedPayload = { requestId: string; roomId: string };

/* ------------------------------------------------------------------ */
/* Playback sync                                                       */
/* ------------------------------------------------------------------ */

export type PlaybackStateWire = "playing" | "paused";

/** Client → server: a user-initiated playback control event. */
export type PlaybackUpdatePayload = {
  roomId: string;
  videoId: string;
  position: number;
  time: number;
  state: PlaybackStateWire;
};

/**
 * Server → client: broadcast on every accepted update + the response
 * to a poll. `updatedAt` is server epoch ms — receivers drift-compensate
 * across the server→receiver hop with `Date.now() - updatedAt`.
 */
export type PlaybackSyncPayload = {
  roomId: string;
  videoId: string;
  position: number;
  time: number;
  state: PlaybackStateWire;
  updatedBy: string;
  updatedAt: number;
};

/** Server → existing peer: "tell me the current state right now". */
export type PlaybackPollPayload = { roomId: string };

/** Existing peer → server: response to a poll. */
export type PlaybackReportPayload = {
  roomId: string;
  videoId: string;
  position: number;
  time: number;
  state: PlaybackStateWire;
};
