/**
 * PATCH /rooms/:roomId/settings
 *
 * Authenticated. Creator + co-owner may mutate settings; others get 404
 * (don't leak existence) — defense in depth on top of client-side gating.
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
 *   404 { ok: false, error }   // room missing or requester is not elevated
 *   500 { ok: false, error }
 *
 * The settings update + the `lastUsedAt` bump on `Room` happen in one
 * `prisma.$transaction` so they're atomic.
 */
import type { Request, Response } from "express";
import { prisma } from "../db";
import { getIo } from "../ws";
import { updateSettingsSchema } from "./schemas";
import { isElevatedRoomModerator } from "./roleAuth";

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
      select: { roomId: true },
    });
    if (!room) {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }
    const canMutate = await isElevatedRoomModerator(userId, roomId);
    if (!canMutate) {
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

    const payload = {
      roomId,
      settings: {
        nature: settings.nature,
        loop: settings.loop,
        editAccess: settings.editAccess,
        chatRights: settings.chatRights,
        videoAudioRights: settings.videoAudioRights,
      },
      updatedBy: userId,
    };
    getIo()?.to(`room:${roomId}`).emit("room.settings.updated", payload);

    return res.status(200).json({
      ok: true,
      settings: payload.settings,
    });
  } catch (err) {
    console.error("[rooms/update-settings] failed:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Couldn't update settings. Try again." });
  }
}

