/**
 * Per-socket handlers wired up after authentication succeeds. Runs once
 * per connection.
 *
 * Channel naming:
 *   room:<roomId>   — broadcast target for everyone watching a room
 *   user:<userId>   — direct-target for messages aimed at one person
 *                     (e.g. "your join request was approved"). Each
 *                     socket auto-joins this on connect, regardless of
 *                     room subscription.
 */

import type { Server as IOServer, Socket } from "socket.io";
import { prisma } from "../db";
import {
  findAddRequest,
  listAddRequestsForRoom,
  removeAddRequest,
} from "./addRequests";
import { appendMessage, listMessages } from "./chatMessages";
import {
  findRequest,
  listForRoom,
  removeRequest,
} from "./joinRequests";
import { executeRoomKill } from "../rooms/executeRoomKill";
import { appendQueueItem } from "../rooms/queue/queueShared";
import { isElevatedRoomModerator } from "../rooms/roleAuth";
import type {
  AddRequestApprovePayload,
  AddRequestRejectPayload,
  ChatSendAck,
  ChatSendPayload,
  ChatTypingPayload,
  MembersSnapshotPayload,
  MemberLeftPayload,
  MomentReactionSendPayload,
  PlaybackReportPayload,
  PlaybackRequestSnapshotPayload,
  PlaybackSyncPayload,
  PlaybackUpdatePayload,
  RequestApprovePayload,
  RequestRejectPayload,
  RoomMemberWire,
  RoomKillPayload,
  RoomSubscribePayload,
  SocketData,
} from "./types";

/**
 * Classifies a user's relationship to a room. Drives both the
 * `room.subscribe` admission rule (any non-`"none"`) and the
 * "active member" branch (`"owner" | "member"`) which gates the chat
 * channel + chat history emit. Pending users join the `room:`
 * channel for join-flow events but NOT the `chat:` channel.
 *
 * One source of truth for membership shape, used by `room.subscribe`,
 * `room.playback.request-snapshot`, and `room.chat.send`.
 */
type MembershipKind = "none" | "owner" | "co-owner" | "member" | "pending";

async function classifyMembership(
  userId: string,
  roomId: string,
): Promise<MembershipKind> {
  const room = await prisma.room.findUnique({
    where: { roomId },
    select: { createdBy: true },
  });
  if (!room) return "none";
  if (room.createdBy === userId) return "owner";
  const member = await prisma.roomMember.findUnique({
    where: { userId_roomId: { userId, roomId } },
  });
  if (member && !member.isBanned) {
    if (member.status === "SUB_LEADER") return "co-owner";
    return "member";
  }
  if (listForRoom(roomId).some((r) => r.userId === userId)) return "pending";
  return "none";
}

/** Backwards-compat shim: any non-"none" classification = allowed. */
async function userMaySubscribe(
  userId: string,
  roomId: string,
): Promise<boolean> {
  return (await classifyMembership(userId, roomId)) !== "none";
}

async function listRoomMembers(roomId: string): Promise<RoomMemberWire[]> {
  const room = await prisma.room.findUnique({
    where: { roomId },
    select: {
      roomId: true,
      createdBy: true,
      creator: { select: { username: true } },
      members: {
        where: { isBanned: false },
        select: { userId: true, status: true, user: { select: { username: true } } },
      },
    },
  });
  if (!room) return [];

  const out: RoomMemberWire[] = [
    {
      roomId: room.roomId,
      userId: room.createdBy,
      userName: room.creator.username,
      role: "owner",
    },
  ];

  for (const member of room.members) {
    if (member.userId === room.createdBy) continue;
    out.push({
      roomId: room.roomId,
      userId: member.userId,
      userName: member.user.username,
      role: member.status === "SUB_LEADER" ? "co-owner" : "member",
    });
  }
  return out;
}

/** Restrict GIF URLs to Giphy media hosts so chat cannot embed arbitrary URLs. */
function isAllowedGiphyMediaUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    return (
      h === "media.giphy.com" ||
      h === "media1.giphy.com" ||
      h === "media2.giphy.com" ||
      h === "media3.giphy.com" ||
      h === "media4.giphy.com" ||
      h === "i.giphy.com"
    );
  } catch {
    return false;
  }
}

/**
 * Per-socket chat-send token bucket. Cap of 5, refill 1 token / 400 ms.
 * Cheap defence against a malicious client spamming `room.chat.send`
 * — silent drop with a `rate-limited` ack so the sender can roll back
 * the optimistic insert.
 */
const CHAT_BUCKET_CAP = 5;
const CHAT_REFILL_MS = 400;

function consumeChatToken(socket: { data: SocketData }): boolean {
  const now = Date.now();
  const bucket = socket.data.chatBucket ?? {
    tokens: CHAT_BUCKET_CAP,
    lastRefill: now,
  };
  // Refill since last call.
  const elapsed = now - bucket.lastRefill;
  if (elapsed > 0) {
    const refill = Math.floor(elapsed / CHAT_REFILL_MS);
    if (refill > 0) {
      bucket.tokens = Math.min(CHAT_BUCKET_CAP, bucket.tokens + refill);
      bucket.lastRefill = bucket.lastRefill + refill * CHAT_REFILL_MS;
    }
  }
  if (bucket.tokens <= 0) {
    socket.data.chatBucket = bucket;
    return false;
  }
  bucket.tokens -= 1;
  socket.data.chatBucket = bucket;
  return true;
}

/** Moment bursts — cap 8, refill 1 token / ~550 ms (spam guard). */
const REACTION_BUCKET_CAP = 8;
const REACTION_REFILL_MS = 550;

function consumeReactionToken(socket: { data: SocketData }): boolean {
  const now = Date.now();
  const bucket = socket.data.reactionBucket ?? {
    tokens: REACTION_BUCKET_CAP,
    lastRefill: now,
  };
  const elapsed = now - bucket.lastRefill;
  if (elapsed > 0) {
    const refill = Math.floor(elapsed / REACTION_REFILL_MS);
    if (refill > 0) {
      bucket.tokens = Math.min(
        REACTION_BUCKET_CAP,
        bucket.tokens + refill,
      );
      bucket.lastRefill = bucket.lastRefill + refill * REACTION_REFILL_MS;
    }
  }
  if (bucket.tokens <= 0) {
    socket.data.reactionBucket = bucket;
    return false;
  }
  bucket.tokens -= 1;
  socket.data.reactionBucket = bucket;
  return true;
}

export function registerRoomChannelHandlers(io: IOServer, socket: Socket) {
  const data = socket.data as SocketData;

  // Personal channel for direct-targeted events. Leader receives
  // request.created here even if they aren't currently subscribed to a
  // specific room. Requesters receive request.approved / rejected here.
  socket.join(`user:${data.userId}`);

  socket.on("room.subscribe", async (payload: RoomSubscribePayload) => {
    if (typeof payload?.roomId !== "string") return;
    const roomId = payload.roomId.trim();
    if (!roomId) return;

    const kind = await classifyMembership(data.userId, roomId);
    if (kind === "none") {
      console.log(
        `[ws] subscribe REJECTED: userId=${data.userId} roomId=${roomId} (not creator, not member, no pending request)`,
      );
      return;
    }

    socket.join(`room:${roomId}`);
    const isElevated = kind === "owner" || kind === "co-owner";
    console.log(
      `[ws] subscribed: userId=${data.userId} roomId=${roomId} isElevated=${isElevated}`,
    );

    // Leader-only initial state: pending join + video-add requests.
    if (isElevated) {
      const requests = listForRoom(roomId);
      socket.emit("room.request.list", { roomId, requests });
      const addRequests = listAddRequestsForRoom(roomId);
      socket.emit("room.add-request.list", { roomId, requests: addRequests });
    }

    // Active members (owner + non-banned roster) join the chat channel
    // and receive the in-memory history. Pending users intentionally
    // skip — they don't see chat until approved.
    if (kind === "owner" || kind === "co-owner" || kind === "member") {
      socket.join(`chat:${roomId}`);
      socket.emit("room.chat.history", {
        roomId,
        messages: listMessages(roomId),
      });
    }

    const membersPayload: MembersSnapshotPayload = {
      roomId,
      members: await listRoomMembers(roomId),
    };
    socket.emit("room.members.snapshot", membersPayload);

    // Playback snapshot is NO LONGER auto-polled here. The client
    // emits `room.playback.request-snapshot` once its queue is loaded
    // and player is ready — eliminates the buffering race the old
    // auto-poll caused.
  });

  socket.on(
    "room.kill",
    async (payload: RoomKillPayload, ack?: (r: unknown) => void) => {
      if (typeof payload?.roomId !== "string") {
        ack?.({ ok: false, error: "Missing roomId." });
        return;
      }
      const roomId = payload.roomId.trim();
      if (!roomId) {
        ack?.({ ok: false, error: "Missing roomId." });
        return;
      }
      const kind = await classifyMembership(data.userId, roomId);
      if (kind !== "owner") {
        ack?.({ ok: false, error: "Only the room owner can kill the room." });
        return;
      }
      const result = await executeRoomKill(io, data.userId, roomId);
      if (!result.ok) {
        if (result.error === "not-found") {
          ack?.({ ok: false, error: "Room not found." });
          return;
        }
        if (result.error === "forbidden") {
          ack?.({ ok: false, error: "Only the room owner can kill the room." });
          return;
        }
        ack?.({ ok: false, error: "Couldn't delete the room. Try again." });
        return;
      }
      ack?.({ ok: true });
    },
  );

  socket.on(
    "room.playback.request-snapshot",
    async (payload: PlaybackRequestSnapshotPayload) => {
      if (typeof payload?.roomId !== "string") return;
      const { roomId } = payload;
      // Same membership gate as subscribe. A user not in the room
      // can't ask for state.
      if (!(await userMaySubscribe(data.userId, roomId))) return;
      try {
        const peers = await io.in(`room:${roomId}`).fetchSockets();
        const target = peers.find((s) => s.id !== socket.id);
        if (target) {
          target.emit("room.playback.poll-state", {
            roomId,
            requesterUserId: data.userId,
          });
        }
        // No peer → silently no-op. Requester cold-starts.
      } catch (err) {
        console.error("[ws] snapshot request dispatch failed:", err);
      }
    },
  );

  socket.on("room.request.approve", async (payload: RequestApprovePayload) => {
    if (typeof payload?.requestId !== "string") return;
    const { requestId } = payload;

    const found = findRequest(requestId);
    if (!found) return;

    const canApprove = await isElevatedRoomModerator(data.userId, found.roomId);
    if (!canApprove) return;
    const room = await prisma.room.findUnique({
      where: { roomId: found.roomId },
      include: { settings: true },
    });
    if (!room) return;

    // Insert as a viewer (default member status). Idempotent via upsert.
    try {
      await prisma.roomMember.upsert({
        where: {
          userId_roomId: { userId: found.userId, roomId: found.roomId },
        },
        update: { isBanned: false },
        create: {
          userId: found.userId,
          roomId: found.roomId,
          status: "VIEWER",
        },
      });
    } catch (err) {
      console.error("[ws] approve upsert failed:", err);
      return;
    }

    removeRequest(requestId);

    // Notify the requester with the room payload so their client can
    // transition to the fully-joined view without a second fetch.
    io.to(`user:${found.userId}`).emit("room.request.approved", {
      requestId,
      room: {
        roomId: room.roomId,
        name: room.name,
        createdBy: room.createdBy,
        createdAt: room.createdAt.toISOString(),
        lastUsedAt: room.lastUsedAt.toISOString(),
        settings: room.settings
          ? {
              nature: room.settings.nature,
              loop: room.settings.loop,
              editAccess: room.settings.editAccess,
              chatRights: room.settings.chatRights,
              videoAudioRights: room.settings.videoAudioRights,
            }
          : null,
      },
    });

    // Notify the room channel that this request is gone so the
    // leader's panel filters it out. Separate event from
    // `room.member.joined` so other listeners can react to either
    // signal independently.
    io.to(`room:${found.roomId}`).emit("room.request.removed", {
      requestId,
      roomId: found.roomId,
    });

    // Tell everyone in the room someone joined — useful later for
    // "X joined" toasts.
    io.to(`room:${found.roomId}`).emit("room.member.joined", {
      roomId: found.roomId,
      member: {
        roomId: found.roomId,
        userId: found.userId,
        userName: found.userName,
        role: "member",
      },
    });
  });

  socket.on("room.request.reject", async (payload: RequestRejectPayload) => {
    if (typeof payload?.requestId !== "string") return;
    const { requestId } = payload;

    const found = findRequest(requestId);
    if (!found) return;

    const canReject = await isElevatedRoomModerator(data.userId, found.roomId);
    if (!canReject) return;

    removeRequest(requestId);

    // Targeted at the requester only — they're the one who needs the
    // toast + redirect-home flow. The leader's panel does NOT listen
    // to this event; it listens to `room.request.removed` (below).
    io.to(`user:${found.userId}`).emit("room.request.rejected", {
      requestId,
      roomId: found.roomId,
    });
    // Single source of truth for "this request is gone, drop it from
    // the panel" — fired for both approve and reject. The requester
    // will receive this too (they're in the room channel because of
    // their pending request) but they have no listener for it.
    io.to(`room:${found.roomId}`).emit("room.request.removed", {
      requestId,
      roomId: found.roomId,
    });
  });

  /* ----------------------------------------------------------------- */
  /* Playback sync — pure relay, no in-memory store.                    */
  /* ----------------------------------------------------------------- */

  // User-initiated playback control event (pause / play / seek / jump
  // / auto-advance). Server validates authority, then broadcasts to
  // everyone EXCEPT the sender (loop closure layer #1). No state is
  // persisted — peers carry the truth in their YT iframes.
  socket.on("room.playback.update", async (p: PlaybackUpdatePayload) => {
    if (typeof p?.roomId !== "string") return;
    if (typeof p.videoId !== "string") return;

    const room = await prisma.room.findUnique({
      where: { roomId: p.roomId },
      include: { settings: true },
    });
    if (!room) return;

    const isElevated = await isElevatedRoomModerator(data.userId, p.roomId);
    // Authority for driving playback is governed by `editAccess`:
    //   LIMITED → owner-only; ALL → any member (incl. owner).
    if (room.settings?.editAccess === "LIMITED" && !isElevated) return;
    // Either way: verify membership for non-owners. Banned / non-members
    // get a silent drop.
    if (!isElevated) {
      const member = await prisma.roomMember.findUnique({
        where: { userId_roomId: { userId: data.userId, roomId: p.roomId } },
      });
      if (!member || member.isBanned) return;
    }

    const now = Date.now();
    const sync: PlaybackSyncPayload = {
      roomId: p.roomId,
      videoId: p.videoId,
      position: p.position,
      time: p.time,
      state: p.state,
      updatedBy: data.userId,
      updatedAt: now,
      // Control-event path: the client doesn't capture a peer-relative
      // timestamp for its own emit, so capturedAt collapses to the
      // server's stamp. Drift is just server→receiver, identical to
      // the prior single-timestamp behavior.
      capturedAt: now,
    };
    socket.to(`room:${p.roomId}`).emit("room.playback.sync", sync);
  });

  // Response to `room.playback.poll-state` (issued via the new
  // `room.playback.request-snapshot` flow). Targeted reply to the
  // requester via their `user:` channel — existing members already
  // have the state, no point broadcasting.
  socket.on("room.playback.report-state", (p: PlaybackReportPayload) => {
    if (typeof p?.roomId !== "string") return;
    if (typeof p.videoId !== "string") return;
    if (typeof p.requesterUserId !== "string") return;
    if (typeof p.capturedAt !== "number") return;

    const sync: PlaybackSyncPayload = {
      roomId: p.roomId,
      videoId: p.videoId,
      position: p.position,
      time: p.time,
      state: p.state,
      updatedBy: data.userId,
      updatedAt: Date.now(),
      // Peer's capture stamp is what the receiver uses for drift.
      capturedAt: p.capturedAt,
    };
    io.to(`user:${p.requesterUserId}`).emit("room.playback.sync", sync);
  });

  /* ----------------------------------------------------------------- */
  /* Video-add requests — leader approves/rejects via these handlers.   */
  /* ----------------------------------------------------------------- */

  socket.on(
    "room.add-request.approve",
    async (payload: AddRequestApprovePayload) => {
      if (typeof payload?.requestId !== "string") return;
      const { requestId } = payload;

      const found = findAddRequest(requestId);
      if (!found) return;

      const canApprove = await isElevatedRoomModerator(data.userId, found.roomId);
      if (!canApprove) return;

      // Persist the video into the queue using the shared helper —
      // same transactional position assignment + lastUsedAt bump +
      // `room.queue.added` broadcast as the direct-add path. The
      // requester sees the video appear in their queue panel via
      // their `onQueueAdded` handler.
      try {
        await appendQueueItem({
          roomId: found.roomId,
          videoId: found.videoId,
          addedById: found.userId,
          addedByName: found.userName,
        });
      } catch (err) {
        console.error("[ws] add-request approve append failed:", err);
        return;
      }

      removeAddRequest(requestId);

      // Targeted: the requester gets a toast.
      io.to(`user:${found.userId}`).emit("room.add-request.approved", {
        requestId,
        roomId: found.roomId,
        videoId: found.videoId,
      });
      // Broadcast: leader's panel filters the card.
      io.to(`room:${found.roomId}`).emit("room.add-request.removed", {
        requestId,
        roomId: found.roomId,
      });
    },
  );

  socket.on(
    "room.add-request.reject",
    async (payload: AddRequestRejectPayload) => {
      if (typeof payload?.requestId !== "string") return;
      const { requestId } = payload;

      const found = findAddRequest(requestId);
      if (!found) return;

      const canReject = await isElevatedRoomModerator(data.userId, found.roomId);
      if (!canReject) return;

      removeAddRequest(requestId);

      io.to(`user:${found.userId}`).emit("room.add-request.rejected", {
        requestId,
        roomId: found.roomId,
        videoId: found.videoId,
      });
      io.to(`room:${found.roomId}`).emit("room.add-request.removed", {
        requestId,
        roomId: found.roomId,
      });
    },
  );

  /* ----------------------------------------------------------------- */
  /* Chat — text messages, typing indicator.                            */
  /* ----------------------------------------------------------------- */

  socket.on(
    "room.chat.send",
    async (
      p: ChatSendPayload,
      ack?: (response: ChatSendAck) => void,
    ) => {
      // Validate shape. Bail without ack on garbage input.
      if (
        typeof p?.roomId !== "string" ||
        typeof p?.clientNonce !== "string"
      ) {
        return;
      }
      const nonce = p.clientNonce;
      const fail = (reason: Extract<ChatSendAck, { ok: false }>["reason"]) =>
        ack?.({ ok: false, reason, clientNonce: nonce });

      const isGif = p.type === "gif";
      let body = "";
      let gifUrl: string | undefined;

      if (isGif) {
        if (typeof p.gifUrl !== "string") return fail("empty");
        gifUrl = p.gifUrl.trim();
        if (gifUrl.length === 0) return fail("empty");
        if (gifUrl.length > 2048) return fail("too-long");
        if (!isAllowedGiphyMediaUrl(gifUrl)) return fail("forbidden");
      } else {
        if (typeof p.body !== "string") return;
        body = p.body.trim();
        if (body.length === 0) return fail("empty");
        if (body.length > 2000) return fail("too-long");
      }

      // chatRights gate: LIMITED → owner-only.
      const room = await prisma.room.findUnique({
        where: { roomId: p.roomId },
        include: { settings: true },
      });
      if (!room) return fail("forbidden");
      const isElevated = await isElevatedRoomModerator(data.userId, p.roomId);
      if (room.settings?.chatRights === "LIMITED" && !isElevated) {
        return fail("forbidden");
      }

      // Active-member check (no pending users sending chat).
      if (!isElevated) {
        const member = await prisma.roomMember.findUnique({
          where: {
            userId_roomId: { userId: data.userId, roomId: p.roomId },
          },
        });
        if (!member || member.isBanned) return fail("membership");
      }

      if (!consumeChatToken(socket as { data: SocketData })) {
        return fail("rate-limited");
      }

      const message = appendMessage({
        roomId: p.roomId,
        senderId: data.userId,
        senderName: data.username,
        body,
        ...(isGif ? { type: "gif" as const, gifUrl: gifUrl! } : {}),
      });

      // Broadcast to peers ONLY — sender already has the local
      // optimistic copy; the ack below upgrades it to "delivered".
      socket.to(`chat:${p.roomId}`).emit("room.chat.message", { message });

      ack?.({
        ok: true,
        id: message.id,
        createdAt: message.createdAt,
        clientNonce: nonce,
      });
    },
  );

  socket.on("room.chat.typing.start", (p: ChatTypingPayload) => {
    if (typeof p?.roomId !== "string") return;
    // Already in the chat: channel = already an active member. The
    // membership re-check on subscribe gates the join. If a client
    // emits typing without being in the channel (race or hostile),
    // peers won't receive it anyway because we route via the same
    // channel — this guard short-circuits before we even try.
    if (!socket.rooms.has(`chat:${p.roomId}`)) return;
    socket.to(`chat:${p.roomId}`).emit("room.chat.typing.start", {
      roomId: p.roomId,
      userId: data.userId,
      userName: data.username,
    });
  });

  socket.on("room.chat.typing.stop", (p: ChatTypingPayload) => {
    if (typeof p?.roomId !== "string") return;
    if (!socket.rooms.has(`chat:${p.roomId}`)) return;
    socket.to(`chat:${p.roomId}`).emit("room.chat.typing.stop", {
      roomId: p.roomId,
      userId: data.userId,
      userName: data.username,
    });
  });

  /* ----------------------------------------------------------------- */
  /* Moment reactions — ephemeral bursts (no DB). Broadcast to full    */
  /* `room:` channel so everyone including the sender receives once.   */
  /* ----------------------------------------------------------------- */

  socket.on("room.moment.reaction.send", async (p: MomentReactionSendPayload) => {
    if (
      typeof p?.roomId !== "string" ||
      typeof p?.emoji !== "string" ||
      typeof p?.burstId !== "string"
    ) {
      return;
    }
    const roomId = p.roomId.trim();
    const emoji = p.emoji.trim();
    const burstId = p.burstId.trim();
    if (!roomId || !emoji || !burstId) return;
    if (emoji.length > 16 || burstId.length > 96) return;
    if (!(await userMaySubscribe(data.userId, roomId))) return;

    /**
     * Always (re)join the Socket.IO room here. The first `room.subscribe`
     * often races HTTP membership — the socket can miss `room:${roomId}`
     * and then reaction emits were silently dropped while local optimistic
     * UI still ran. `join` is idempotent.
     */
    socket.join(`room:${roomId}`);

    if (!consumeReactionToken(socket as { data: SocketData })) {
      return;
    }

    io.to(`room:${roomId}`).emit("room.moment.reaction", {
      roomId,
      emoji,
      burstId,
      userId: data.userId,
      userName: data.username,
    });
  });

  // If the user disconnects mid-type, peers should stop showing them
  // as typing. Send a synthetic stop to every chat channel they were
  // in. Receivers also have a 5 s TTL safety, so this is belt-and-
  // suspenders, not load-bearing.
  socket.on("disconnect", () => {
    for (const room of socket.rooms) {
      if (room.startsWith("room:")) {
        const roomId = room.slice("room:".length);
        const payload: MemberLeftPayload = {
          roomId,
          userId: data.userId,
        };
        socket.to(room).emit("room.member.left", payload);
      }
      if (room.startsWith("chat:")) {
        const roomId = room.slice("chat:".length);
        socket.to(room).emit("room.chat.typing.stop", {
          roomId,
          userId: data.userId,
          userName: data.username,
        });
      }
    }
  });
}
