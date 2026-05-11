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
import { getIo } from "../ws";
import { executeRoomKill } from "./executeRoomKill";

export async function deleteRoomHandler(req: Request, res: Response) {
  const roomIdParam = req.params.roomId;
  const roomId = typeof roomIdParam === "string" ? roomIdParam : undefined;
  if (!roomId) {
    return res.status(400).json({ ok: false, error: "Missing roomId." });
  }

  const userId = req.user!.userId;

  const result = await executeRoomKill(getIo(), userId, roomId);
  if (!result.ok) {
    if (result.error === "not-found") {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }
    if (result.error === "forbidden") {
      return res
        .status(403)
        .json({ ok: false, error: "Only the room creator can delete it." });
    }
    return res
      .status(500)
      .json({ ok: false, error: "Couldn't delete the room. Try again." });
  }
  return res.status(200).json({ ok: true });
}
