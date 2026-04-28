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
/* Video-add requests (broadcast carousel — companion to JoinRequest)  */
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

/** Client-emitted approve/reject for video-add requests. */
export type AddRequestApprovePayload = { requestId: string };
export type AddRequestRejectPayload = { requestId: string };

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
 * Server → client: broadcast on every accepted update + the targeted
 * response to a snapshot request. `updatedAt` is the server's stamp
 * when the broadcast was sent. `capturedAt` is whoever read the time
 * off the YT iframe — a peer's local clock for snapshot replies, or
 * the server's clock for `playback.update` broadcasts (the client
 * doesn't capture a peer-relative timestamp on a control event).
 * Receivers drift-compensate using `capturedAt`, NOT `updatedAt`, so
 * the peer→server hop is included in the compensation window.
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
 * Server → existing peer: "tell me the current state right now, and
 * include the user id you're answering for so I can route the reply".
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
  /** Peer's local `Date.now()` at the moment they read getCurrentTime(). */
  capturedAt: number;
  /** Echoed from the poll so the server can target the requester. */
  requesterUserId: string;
};

/**
 * Client → server: "I'm ready, ask a peer for the current state and
 * route their reply to me." Sent only after queue + player are both
 * loaded — the buffering race the old auto-poll-on-subscribe path
 * suffered is gone because the request is client-driven.
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
 * Server → sender via Socket.IO emit-with-ack callback. Carries
 * `clientNonce` echoed from the request so the client can match the
 * pending optimistic message and upgrade it to "delivered".
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

/** Per-socket data attached on auth. Read in handlers via `socket.data`. */
export type SocketData = {
  userId: string;
  username: string;
  /**
   * Per-socket token bucket for the chat send rate limit. Lazy-init
   * on first send. Refills 1 token / 400 ms up to a cap of 5.
   */
  chatBucket?: { tokens: number; lastRefill: number };
};
