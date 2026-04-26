/**
 * PATCH /rooms/:roomId/settings
 *
 * Authenticated. Only the room's creator (`Room.createdBy`) may mutate
 * settings; non-owners get 404 (don't leak existence) — defense in
 * depth on top of the client-side gear gating.
 *
 * Body (any subset; at least one key required):
 *   {
 *     nature?: "PUBLIC" | "PRIVATE",
 *     loop?: boolean,
 *     editAccess?: "ALL" | "LIMITED",
 *     chatRights?: "ALL" | "LIMITED",
 *     videoAudioRights?: "ALL" | "LIMITED"
 *   }
 *
 * Response shapes:
 *   200 { ok: true, settings: { ... full RoomSettings ... } }
 *   400 { ok: false, error }   // missing :roomId, empty body, or Zod failure
 *   401 (handled by requireAuth)
 *   404 { ok: false, error }   // room missing or requester is not the creator
 *   500 { ok: false, error }
 *
 * The settings update + the `lastUsedAt` bump on `Room` happen in one
 * `prisma.$transaction` so they're atomic.
 */
import type { Request, Response } from "express";
import { prisma } from "../db";
import { updateSettingsSchema } from "./schemas";

export async function updateSettingsHandler(req: Request, res: Response) {
  const roomIdParam = req.params.roomId;
  const roomId = typeof roomIdParam === "string" ? roomIdParam : undefined;
  if (!roomId) {
    return res.status(400).json({ ok: false, error: "Missing roomId." });
  }

  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({ ok: false, error: issue.message });
  }

  const userId = req.user!.userId;

  try {
    const room = await prisma.room.findUnique({
      where: { roomId },
      select: { createdBy: true },
    });
    // Same response for "doesn't exist" and "not the creator" so we don't
    // leak room existence to non-owners.
    if (!room || room.createdBy !== userId) {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }

    const settings = await prisma.$transaction(async (tx) => {
      const updated = await tx.roomSettings.update({
        where: { roomId },
        data: parsed.data,
      });
      await tx.room.update({
        where: { roomId },
        data: { lastUsedAt: new Date() },
      });
      return updated;
    });

    return res.status(200).json({
      ok: true,
      settings: {
        nature: settings.nature,
        loop: settings.loop,
        editAccess: settings.editAccess,
        chatRights: settings.chatRights,
        videoAudioRights: settings.videoAudioRights,
      },
    });
  } catch (err) {
    console.error("[rooms/update-settings] failed:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Couldn't update settings. Try again." });
  }
}
