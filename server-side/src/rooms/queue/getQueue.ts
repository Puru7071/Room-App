/**
 * GET /rooms/:roomId/queue
 *
 * Returns the persisted queue for a room, ordered by `position` ASC.
 * The caller must be a member of the room (or the room creator) —
 * non-members get a 403 so the queue isn't readable from outside.
 *
 * Response:
 *   200 { ok: true, items: [{ id, videoId, addedById, addedByName, addedAt, position }] }
 *   400 { ok: false, error }    // missing roomId
 *   401 (handled by requireAuth)
 *   403 { ok: false, error }    // caller is not a room member
 *   404 { ok: false, error }    // room doesn't exist
 *   500 { ok: false, error }
 */
import type { Request, Response } from "express";
import { prisma } from "../../db";

export async function getQueueHandler(req: Request, res: Response) {
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

    // Creator bypasses the membership check (covers the rare case
    // where their RoomMember row is missing for any reason).
    if (room.createdBy !== userId) {
      const member = await prisma.roomMember.findUnique({
        where: { userId_roomId: { userId, roomId } },
      });
      if (!member || member.isBanned) {
        return res
          .status(403)
          .json({ ok: false, error: "You're not a member of this room." });
      }
    }

    const items = await prisma.roomQueueItem.findMany({
      where: { roomId },
      orderBy: { position: "asc" },
      select: {
        id: true,
        videoId: true,
        addedById: true,
        addedByName: true,
        addedAt: true,
        position: true,
      },
    });

    return res.status(200).json({
      ok: true,
      items: items.map((it) => ({
        id: it.id,
        videoId: it.videoId,
        addedById: it.addedById,
        addedByName: it.addedByName,
        addedAt: it.addedAt.toISOString(),
        position: it.position,
      })),
    });
  } catch (err) {
    console.error("[rooms/queue/get] failed:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Couldn't load the queue." });
  }
}
