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
 * Server → client: broadcast on every accepted update + the targeted
 * response to a snapshot request. Receivers drift-compensate using
 * `capturedAt` (peer's local clock for snapshot replies; server clock
 * for control-event broadcasts) so the peer→server hop is included.
 */
export type PlaybackSyncPayload = {
  roomId: string;
  videoId: string;
  position: number;
  time: number;
  state: PlaybackStateWire;
  updatedBy: string;
  updatedAt: number;
  capturedAt: number;
};

/**
 * Server → existing peer: "tell me the current state right now, for
 * this requesting user". The peer echoes `requesterUserId` back in
 * the report so the server can target the reply.
 */
export type PlaybackPollPayload = {
  roomId: string;
  requesterUserId: string;
};

/** Existing peer → server: response to a poll. */
export type PlaybackReportPayload = {
  roomId: string;
  videoId: string;
  position: number;
  time: number;
  state: PlaybackStateWire;
  /** Peer's local `Date.now()` at the moment of getCurrentTime(). */
  capturedAt: number;
  /** Echoed from the poll so the server can target the reply. */
  requesterUserId: string;
};

/**
 * Client → server: "I'm ready (queue + player), ask a peer for the
 * current state and route the reply to me." Replaces the old auto-poll
 * on `room.subscribe` so the buffering race is gone.
 */
export type PlaybackRequestSnapshotPayload = { roomId: string };

/* ------------------------------------------------------------------ */
/* Chat                                                                */
/* ------------------------------------------------------------------ */

/** A single chat message on the wire. Server is the source of `id` + `createdAt`. */
export type ChatMessageWire = {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: number; // ms epoch
};

/** Client → server: send a chat message. `clientNonce` correlates the ack. */
export type ChatSendPayload = {
  roomId: string;
  body: string;
  clientNonce: string;
};

/**
 * Server → sender via Socket.IO emit-with-ack callback. `clientNonce`
 * is echoed so the sender can match the pending optimistic message
 * and upgrade it to "delivered".
 */
export type ChatSendAck =
  | { ok: true; id: string; createdAt: number; clientNonce: string }
  | {
      ok: false;
      reason: "too-long" | "empty" | "rate-limited" | "forbidden" | "membership";
      clientNonce: string;
    };

/** Server → just-joined active member: snapshot of the in-memory buffer. */
export type ChatHistoryPayload = {
  roomId: string;
  messages: ChatMessageWire[];
};

/** Server → peers (NOT sender) on every accepted send. */
export type ChatMessagePayload = { message: ChatMessageWire };

/** Client → server: typing start/stop. */
export type ChatTypingPayload = { roomId: string };

/** Server → peers (NOT sender): a user started/stopped typing. */
export type ChatTypingBroadcastPayload = {
  roomId: string;
  userId: string;
  userName: string;
};
