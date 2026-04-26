/**
 * DELETE /rooms/:roomId
 *
 * Hard-deletes a room and everything that hangs off it (settings,
 * members, invites). Only the room creator can delete; everyone else
 * gets a 403. The Prisma schema has `onDelete: Cascade` on every
 * child relation, so a single `prisma.room.delete()` does it all.
 *
 * Response:
 *   200 { ok: true }
 *   400 { ok: false, error }    // missing roomId
 *   401 (handled by requireAuth)
 *   403 { ok: false, error }    // caller is not the room creator
 *   404 { ok: false, error }    // room doesn't exist
 *   500 { ok: false, error }
 */
import type { Request, Response } from "express";
import { prisma } from "../db";

export async function deleteRoomHandler(req: Request, res: Response) {
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
    if (room.createdBy !== userId) {
      return res
        .status(403)
        .json({ ok: false, error: "Only the room creator can delete it." });
    }

    await prisma.room.delete({ where: { roomId } });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[rooms/delete] failed:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Couldn't delete the room. Try again." });
  }
}
