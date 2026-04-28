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
import { appendQueueItem } from "../rooms/queue/queueShared";
import type {
  AddRequestApprovePayload,
  AddRequestRejectPayload,
  ChatSendAck,
  ChatSendPayload,
  ChatTypingPayload,
  PlaybackReportPayload,
  PlaybackRequestSnapshotPayload,
  PlaybackSyncPayload,
  PlaybackUpdatePayload,
  RequestApprovePayload,
  RequestRejectPayload,
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
type MembershipKind = "none" | "owner" | "member" | "pending";

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
  if (member && !member.isBanned) return "member";
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

export function registerRoomChannelHandlers(io: IOServer, socket: Socket) {
  const data = socket.data as SocketData;

  // Personal channel for direct-targeted events. Leader receives
  // request.created here even if they aren't currently subscribed to a
  // specific room. Requesters receive request.approved / rejected here.
  socket.join(`user:${data.userId}`);

  socket.on("room.subscribe", async (payload: RoomSubscribePayload) => {
    if (typeof payload?.roomId !== "string") return;
    const { roomId } = payload;

    const kind = await classifyMembership(data.userId, roomId);
    if (kind === "none") {
      console.log(
        `[ws] subscribe REJECTED: userId=${data.userId} roomId=${roomId} (not creator, not member, no pending request)`,
      );
      return;
    }

    socket.join(`room:${roomId}`);
    const isCreator = kind === "owner";
    console.log(
      `[ws] subscribed: userId=${data.userId} roomId=${roomId} isCreator=${isCreator}`,
    );

    // Leader-only initial state: pending join + video-add requests.
    if (isCreator) {
      const requests = listForRoom(roomId);
      socket.emit("room.request.list", { roomId, requests });
      const addRequests = listAddRequestsForRoom(roomId);
      socket.emit("room.add-request.list", { roomId, requests: addRequests });
    }

    // Active members (owner + non-banned roster) join the chat channel
    // and receive the in-memory history. Pending users intentionally
    // skip — they don't see chat until approved.
    if (kind === "owner" || kind === "member") {
      socket.join(`chat:${roomId}`);
      socket.emit("room.chat.history", {
        roomId,
        messages: listMessages(roomId),
      });
    }

    // Playback snapshot is NO LONGER auto-polled here. The client
    // emits `room.playback.request-snapshot` once its queue is loaded
    // and player is ready — eliminates the buffering race the old
    // auto-poll caused.
  });

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

    // Verify caller is the room creator. Anyone else trying to approve
    // is a no-op (could be malicious or a client bug).
    const room = await prisma.room.findUnique({
      where: { roomId: found.roomId },
      include: { settings: true },
    });
    if (!room || room.createdBy !== data.userId) return;

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
      userId: found.userId,
      userName: found.userName,
    });
  });

  socket.on("room.request.reject", async (payload: RequestRejectPayload) => {
    if (typeof payload?.requestId !== "string") return;
    const { requestId } = payload;

    const found = findRequest(requestId);
    if (!found) return;

    const room = await prisma.room.findUnique({
      where: { roomId: found.roomId },
      select: { createdBy: true },
    });
    if (!room || room.createdBy !== data.userId) return;

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

    const isOwner = room.createdBy === data.userId;
    // Authority for driving playback is governed by `editAccess`:
    //   LIMITED → owner-only; ALL → any member (incl. owner).
    if (room.settings?.editAccess === "LIMITED" && !isOwner) return;
    // Either way: verify membership for non-owners. Banned / non-members
    // get a silent drop.
    if (!isOwner) {
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

      // Only the room creator can approve.
      const room = await prisma.room.findUnique({
        where: { roomId: found.roomId },
        select: { createdBy: true },
      });
      if (!room || room.createdBy !== data.userId) return;

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

      const room = await prisma.room.findUnique({
        where: { roomId: found.roomId },
        select: { createdBy: true },
      });
      if (!room || room.createdBy !== data.userId) return;

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
        typeof p?.body !== "string" ||
        typeof p?.clientNonce !== "string"
      ) {
        return;
      }
      const nonce = p.clientNonce;
      const fail = (reason: Extract<ChatSendAck, { ok: false }>["reason"]) =>
        ack?.({ ok: false, reason, clientNonce: nonce });

      const body = p.body.trim();
      if (body.length === 0) return fail("empty");
      if (body.length > 2000) return fail("too-long");

      // chatRights gate: LIMITED → owner-only.
      const room = await prisma.room.findUnique({
        where: { roomId: p.roomId },
        include: { settings: true },
      });
      if (!room) return fail("forbidden");
      const isOwner = room.createdBy === data.userId;
      if (room.settings?.chatRights === "LIMITED" && !isOwner) {
        return fail("forbidden");
      }

      // Active-member check (no pending users sending chat).
      if (!isOwner) {
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

  // If the user disconnects mid-type, peers should stop showing them
  // as typing. Send a synthetic stop to every chat channel they were
  // in. Receivers also have a 5 s TTL safety, so this is belt-and-
  // suspenders, not load-bearing.
  socket.on("disconnect", () => {
    for (const room of socket.rooms) {
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
