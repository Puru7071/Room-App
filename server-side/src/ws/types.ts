/**
 * Shared types for the WebSocket layer.
 *
 * Event names use the `<scope>.<noun>.<verb>` convention so the wire is
 * self-documenting:
 *   room.subscribe       — client-emitted, joins a Socket.IO channel
 *   room.request.list    — server-emitted, current pending requests
 *   room.request.created — server-emitted, a new request just landed
 *   room.request.expired — server-emitted, TTL sweep removed one
 *   room.request.approve — client-emitted by leader, approve a request
 *   room.request.approved — server-emitted to requester
 *   room.request.reject  — client-emitted by leader, reject a request
 *   room.request.rejected — server-emitted to requester
 *   room.member.joined   — server-emitted to room channel on any join
 */

/**
 * Shape of a room as it appears on the wire — mirrors what `getRoom`
 * returns to HTTP callers so the same client type works for both.
 */
export type RoomSettingsWire = {
  nature: "PUBLIC" | "PRIVATE";
  loop: boolean;
  editAccess: "ALL" | "LIMITED";
  chatRights: "ALL" | "LIMITED";
  videoAudioRights: "ALL" | "LIMITED";
};

export type RoomDetailWire = {
  roomId: string;
  name: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string;
  settings: RoomSettingsWire | null;
};

export type JoinRequestWire = {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  /** ISO-8601 — easier than Date for the wire and the client. */
  createdAt: string;
  expiresAt: string;
};

// Client → server payloads
export type RoomSubscribePayload = { roomId: string };
export type RequestApprovePayload = { requestId: string };
export type RequestRejectPayload = { requestId: string };

// Server → client payloads
export type RequestListPayload = {
  roomId: string;
  requests: JoinRequestWire[];
};
export type RequestCreatedPayload = { request: JoinRequestWire };
export type RequestExpiredPayload = { requestId: string; roomId: string };
export type RequestApprovedPayload = {
  requestId: string;
  room: RoomDetailWire;
};
export type RequestRejectedPayload = { requestId: string; roomId: string };
/**
 * Broadcast on the `room:` channel for both approve and reject so the
 * leader's panel filters the card from state. Decoupled from the
 * requester-targeted `approved`/`rejected` events to avoid the
 * dual-broadcast duplicate-toast bug.
 */
export type RequestRemovedPayload = { requestId: string; roomId: string };
export type MemberJoinedPayload = {
  roomId: string;
  userId: string;
  userName: string;
};

/**
 * Wire shape of a single queue item — mirrors what `GET /rooms/:id/queue`
 * returns. Strings only (incl. ISO timestamps) so it serializes cleanly
 * over WS frames.
 */
export type QueueItemWire = {
  id: string;
  videoId: string;
  addedById: string;
  addedByName: string;
  addedAt: string;
  position: number;
};

/**
 * Broadcast on the `room:` channel after a successful add, so every
 * connected member's reducer can append the item. Sender included —
 * single source of truth, no client-side optimism.
 */
export type QueueAddedPayload = { item: QueueItemWire };

/* ------------------------------------------------------------------ */
/* Playback sync                                                       */
/* ------------------------------------------------------------------ */

export type PlaybackStateWire = "playing" | "paused";

/**
 * Client → server: a user-initiated playback control event (pause,
 * play, seek, queue jump, auto-advance to next).
 */
export type PlaybackUpdatePayload = {
  roomId: string;
  videoId: string;
  position: number;
  time: number;
  state: PlaybackStateWire;
};

/**
 * Server → client: broadcast on every accepted update + the response
 * to a poll. `updatedAt` is server epoch ms; receivers drift-compensate
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

/** Per-socket data attached on auth. Read in handlers via `socket.data`. */
export type SocketData = {
  userId: string;
  username: string;
};
