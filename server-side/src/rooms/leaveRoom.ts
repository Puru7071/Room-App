/**
 * POST /rooms/:roomId/leave
 *
 * Non-leaders: delete this user's RoomMember row and broadcast `room.member.left`.
 * Room creator ("leader"): no DB change — they always re-gain membership via join;
 * response tells the client to navigate away only.
 */
import type { Request, Response } from "express";
import { prisma } from "../db";
import { getIo } from "../ws";

export async function leaveRoomHandler(req: Request, res: Response) {
  const roomIdParam = req.params.roomId;
  const roomId = typeof roomIdParam === "string" ? roomIdParam : undefined;
  if (!roomId) {
    return res.status(400).json({ ok: false, error: "Missing roomId." });
  }

  const userId = req.user!.userId;

  try {
    const room = await prisma.room.findUnique({
      where: { roomId },
      select: { createdBy: true },
    });
    if (!room) {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }

    if (room.createdBy === userId) {
      return res.status(200).json({ ok: true, leader: true });
    }

    const removed = await prisma.roomMember.deleteMany({
      where: { userId, roomId },
    });

    if (removed.count > 0) {
      getIo()?.to(`room:${roomId}`).emit("room.member.left", {
        roomId,
        userId,
      });
    }

    return res.status(200).json({ ok: true, leader: false, removed: removed.count > 0 });
  } catch (err) {
    console.error("[rooms/leave] failed:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Couldn't leave the room. Try again." });
  }
}
