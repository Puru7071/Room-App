/**
 * DELETE /rooms/:roomId/members/:userId
 *
 * Removes a member from the room (kick). Owner and co-owners may kick;
 * co-owners cannot kick the owner or another co-owner.
 */
import type { Request, Response } from "express";
import { prisma } from "../db";
import { isElevatedRoomModerator } from "./roleAuth";
import { getIo } from "../ws";

export async function removeRoomMemberHandler(req: Request, res: Response) {
  const roomId = typeof req.params.roomId === "string" ? req.params.roomId : "";
  const targetUserId =
    typeof req.params.userId === "string" ? req.params.userId : "";
  if (!roomId || !targetUserId) {
    return res.status(400).json({ ok: false, error: "Missing roomId or userId." });
  }

  const actorUserId = req.user!.userId;
  if (targetUserId === actorUserId) {
    return res
      .status(400)
      .json({ ok: false, error: "Use leave room to remove yourself." });
  }

  try {
    const room = await prisma.room.findUnique({
      where: { roomId },
      select: { createdBy: true },
    });
    if (!room) {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }
    if (targetUserId === room.createdBy) {
      return res.status(403).json({ ok: false, error: "Cannot remove the room owner." });
    }

    const actorElevated = await isElevatedRoomModerator(actorUserId, roomId);
    if (!actorElevated) {
      return res.status(403).json({ ok: false, error: "Forbidden." });
    }

    if (actorUserId !== room.createdBy) {
      const targetMember = await prisma.roomMember.findUnique({
        where: { userId_roomId: { userId: targetUserId, roomId } },
        select: { status: true, isBanned: true },
      });
      if (!targetMember || targetMember.isBanned) {
        return res.status(404).json({ ok: false, error: "Member not found." });
      }
      if (targetMember.status === "SUB_LEADER") {
        return res.status(403).json({
          ok: false,
          error: "Co-owners cannot remove other co-owners.",
        });
      }
    }

    const removed = await prisma.roomMember.deleteMany({
      where: { userId: targetUserId, roomId },
    });
    if (removed.count === 0) {
      return res.status(404).json({ ok: false, error: "Member not found." });
    }

    const rid = roomId.trim();
    const removedByRole =
      actorUserId === room.createdBy ? ("owner" as const) : ("co-owner" as const);
    const io = getIo();
    if (io) {
      // Room channel: kicked user is still in `room:${rid}` until they disconnect.
      io.to(`room:${rid}`).emit("room.member.kicked", {
        roomId: rid,
        targetUserId,
        removedByRole,
      });
      io.to(`room:${rid}`).emit("room.member.left", {
        roomId: rid,
        userId: targetUserId,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[rooms/member/remove] failed:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Couldn't remove the member." });
  }
}
