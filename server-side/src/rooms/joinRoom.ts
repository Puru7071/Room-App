/**
 * POST /rooms/:roomId/join
 *
 * The single entry point for "let me into this room". Behavior depends
 * on the room's `nature` setting and whether the caller is the room
 * creator:
 *
 *  - **Leader bypass.** If `room.createdBy === caller.userId`, upsert
 *    the caller as `LEADER` and admit them. No private/public check.
 *    Even if their RoomMember row was deleted manually, this puts it
 *    back. The leader is *always* allowed home.
 *  - **Already a member.** Idempotent — returns `already-member`
 *    without touching the DB.
 *  - **Public room.** Upsert as `VIEWER`, broadcast `room.member.joined`,
 *    return `joined`.
 *  - **Private room.** Add a join request to the in-memory store and
 *    push it to each moderator's personal WS channel (room creator +
 *    co-owners); return `pending`. The requester's UI shows a "waiting
 *    for the host" overlay until a moderator resolves it (handled by the
 *    WS layer, not this handler).
 *
 * Response:
 *   200 { ok: true, status: "joined" | "already-member" }
 *   202 { ok: true, status: "pending", requestId }
 *   400 { ok: false, error }    // missing roomId
 *   401 (handled by requireAuth)
 *   404 { ok: false, error }    // room doesn't exist
 *   500 { ok: false, error }
 */
import type { Request, Response } from "express";
import { prisma } from "../db";
import { listElevatedModeratorUserIds } from "./roleAuth";
import { addRequest } from "../ws/joinRequests";
import { getIo } from "../ws";

export async function joinRoomHandler(req: Request, res: Response) {
  const roomIdParam = req.params.roomId;
  const roomId = typeof roomIdParam === "string" ? roomIdParam : undefined;
  if (!roomId) {
    return res.status(400).json({ ok: false, error: "Missing roomId." });
  }

  const userId = req.user!.userId;
  const username = req.user!.username;

  try {
    const room = await prisma.room.findUnique({
      where: { roomId },
      include: { settings: true },
    });
    if (!room) {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }

    const io = getIo();

    // Leader bypass — re-instates RoomMember if missing, no other gating.
    if (room.createdBy === userId) {
      await prisma.roomMember.upsert({
        where: { userId_roomId: { userId, roomId } },
        update: { isBanned: false, status: "LEADER" },
        create: { userId, roomId, status: "LEADER" },
      });
      io?.to(`room:${roomId}`).emit("room.member.joined", {
        roomId,
        userId,
        userName: username,
      });
      return res.status(200).json({ ok: true, status: "joined" });
    }

    const existing = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId } },
    });
    if (existing && !existing.isBanned) {
      return res
        .status(200)
        .json({ ok: true, status: "already-member" });
    }

    const isPublic = room.settings?.nature === "PUBLIC";
    if (isPublic) {
      await prisma.roomMember.upsert({
        where: { userId_roomId: { userId, roomId } },
        update: { isBanned: false },
        create: { userId, roomId, status: "VIEWER" },
      });
      io?.to(`room:${roomId}`).emit("room.member.joined", {
        roomId,
        userId,
        userName: username,
      });
      return res.status(200).json({ ok: true, status: "joined" });
    }

    // Private — queue a request for moderators (creator + co-owners).
    const request = addRequest(roomId, { userId, username });
    const moderatorIds = await listElevatedModeratorUserIds(roomId);
    console.log(
      `[rooms/join] PRIVATE request created: roomId=${roomId} requestId=${request.id} from=${userId}(${username}) → moderators=${moderatorIds.join(",")} ioAttached=${Boolean(io)}`,
    );
    const createdPayload = { request };
    for (const modId of moderatorIds) {
      io?.to(`user:${modId}`).emit("room.request.created", createdPayload);
    }
    // Also broadcast on the room channel so connected members in the
    // room (including moderators' other tabs) see it without relying
    // on the personal-channel fan-out alone.
    io?.to(`room:${roomId}`).emit("room.request.created", { request });

    return res
      .status(202)
      .json({ ok: true, status: "pending", requestId: request.id });
  } catch (err) {
    console.error("[rooms/join] failed:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Couldn't join the room. Try again." });
  }
}
