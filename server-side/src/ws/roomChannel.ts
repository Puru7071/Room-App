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
import {
  findRequest,
  listForRoom,
  removeRequest,
} from "./joinRequests";
import { appendQueueItem } from "../rooms/queue/queueShared";
import type {
  AddRequestApprovePayload,
  AddRequestRejectPayload,
  PlaybackReportPayload,
  PlaybackSyncPayload,
  PlaybackUpdatePayload,
  RequestApprovePayload,
  RequestRejectPayload,
  RoomSubscribePayload,
  SocketData,
} from "./types";

export function registerRoomChannelHandlers(io: IOServer, socket: Socket) {
  const data = socket.data as SocketData;

  // Personal channel for direct-targeted events. Leader receives
  // request.created here even if they aren't currently subscribed to a
  // specific room. Requesters receive request.approved / rejected here.
  socket.join(`user:${data.userId}`);

  socket.on("room.subscribe", async (payload: RoomSubscribePayload) => {
    if (typeof payload?.roomId !== "string") return;
    const { roomId } = payload;

    // Verify the user has any business subscribing — either a member
    // already, the room creator, or has a pending request. Keeps random
    // socket clients from snooping rooms they're unrelated to.
    const room = await prisma.room.findUnique({
      where: { roomId },
      select: { createdBy: true },
    });
    if (!room) return;

    const isCreator = room.createdBy === data.userId;
    const member = isCreator
      ? null
      : await prisma.roomMember.findUnique({
          where: {
            userId_roomId: { userId: data.userId, roomId },
          },
        });
    const hasPending = !isCreator && !member
      ? listForRoom(roomId).some((r) => r.userId === data.userId)
      : false;

    if (!isCreator && !member && !hasPending) {
      console.log(
        `[ws] subscribe REJECTED: userId=${data.userId} roomId=${roomId} (not creator, not member, no pending request)`,
      );
      return;
    }

    socket.join(`room:${roomId}`);
    console.log(
      `[ws] subscribed: userId=${data.userId} roomId=${roomId} isCreator=${isCreator}`,
    );

    // If the subscriber is the room creator, hand them the current
    // pending requests as the initial state. Non-leaders get nothing
    // here — they don't need to see requests.
    if (isCreator) {
      const requests = listForRoom(roomId);
      socket.emit("room.request.list", { roomId, requests });
      // Companion: pending video-add requests for the broadcaster panel.
      const addRequests = listAddRequestsForRoom(roomId);
      socket.emit("room.add-request.list", { roomId, requests: addRequests });
    }

    // Playback snapshot via peer poll. Server holds no playback state,
    // so the only authoritative source for "where is the room right
    // now" is a live peer's YT iframe. Pick any other socket in the
    // channel and ask it to report. The peer's response flows through
    // the `room.playback.report-state` handler below and the resulting
    // `room.playback.sync` broadcast reaches this just-subscribed
    // socket as part of the room.
    try {
      const peers = await io.in(`room:${roomId}`).fetchSockets();
      const target = peers.find((s) => s.id !== socket.id);
      if (target) {
        target.emit("room.playback.poll-state", { roomId });
      }
      // No peers → nothing to sync to. The new joiner cold-starts.
    } catch (err) {
      console.error("[ws] playback poll dispatch failed:", err);
    }
  });

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

    const sync: PlaybackSyncPayload = {
      roomId: p.roomId,
      videoId: p.videoId,
      position: p.position,
      time: p.time,
      state: p.state,
      updatedBy: data.userId,
      updatedAt: Date.now(),
    };
    socket.to(`room:${p.roomId}`).emit("room.playback.sync", sync);
  });

  // Response to a `room.playback.poll-state` we sent on subscribe.
  // No leader-only check — anyone in the room can be polled because
  // they all see the same playback state in steady-state sync. The
  // resulting sync is broadcast to the whole room (including the
  // reporter); the reporter's lastSyncRef gate makes their own
  // applySync a no-op.
  socket.on("room.playback.report-state", (p: PlaybackReportPayload) => {
    if (typeof p?.roomId !== "string") return;
    if (typeof p.videoId !== "string") return;

    const sync: PlaybackSyncPayload = {
      roomId: p.roomId,
      videoId: p.videoId,
      position: p.position,
      time: p.time,
      state: p.state,
      updatedBy: data.userId,
      updatedAt: Date.now(),
    };
    io.to(`room:${p.roomId}`).emit("room.playback.sync", sync);
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
}
