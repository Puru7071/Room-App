/**
 * GET /rooms/:roomId
 *
 * Authenticated read of a room's canonical fields plus its settings row.
 * The client uses `createdBy` to gate owner-only UI (the settings gear)
 * and `name` to display the room title; the URL `?name=` query is only
 * an optimistic hint until this resolves.
 *
 * Response shapes:
 *   200 { ok: true, room: { roomId, name, createdBy, createdAt, lastUsedAt, settings } }
 *   400 { ok: false, error }   // missing :roomId param
 *   401 (handled by requireAuth)
 *   404 { ok: false, error }   // room doesn't exist
 *   500 { ok: false, error }
 *
 * For now any authenticated user can fetch any room — sufficient for UI
 * rendering. Membership-aware authz (private rooms readable only by
 * members or invitees) is a future hardening task.
 */
import type { Request, Response } from "express";
import { prisma } from "../db";

export async function getRoomHandler(req: Request, res: Response) {
  const roomIdParam = req.params.roomId;
  const roomId = typeof roomIdParam === "string" ? roomIdParam : undefined;
  if (!roomId) {
    return res.status(400).json({ ok: false, error: "Missing roomId." });
  }

  try {
    const room = await prisma.room.findUnique({
      where: { roomId },
      include: { settings: true },
    });
    if (!room) {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }
    return res.status(200).json({
      ok: true,
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
  } catch (err) {
    console.error("[rooms/get] failed:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Couldn't load the room." });
  }
}
