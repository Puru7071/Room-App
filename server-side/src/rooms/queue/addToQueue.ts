/**
 * POST /rooms/:roomId/queue
 *
 * Appends a video to the persisted queue and broadcasts a
 * `room.queue.added` WebSocket event to every connected member of the
 * room. The sender receives the broadcast too (they're in the room
 * channel) — no optimistic dispatch on the client side, the WS event
 * is the single source of truth that updates everyone's reducer.
 *
 * Body: { videoId: string }
 *
 * Response:
 *   200 { ok: true, item: { id, videoId, addedById, addedByName, addedAt, position } }
 *   400 { ok: false, error }    // missing roomId / invalid body
 *   401 (handled by requireAuth)
 *   403 { ok: false, error }    // caller is not a room member
 *   404 { ok: false, error }    // room doesn't exist
 *   500 { ok: false, error }
 *
 * Position assignment runs inside a transaction — `max(position) + 1`
 * read and the insert happen serially so two concurrent adds produce
 * distinct positions (instead of both seeing the same max + 1).
 */
import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { getIo } from "../../ws";

const addToQueueSchema = z.object({
  videoId: z
    .string()
    .trim()
    .min(1, "videoId is required.")
    .max(64, "videoId looks invalid."),
});

export async function addToQueueHandler(req: Request, res: Response) {
  const roomIdParam = req.params.roomId;
  const roomId = typeof roomIdParam === "string" ? roomIdParam : undefined;
  if (!roomId) {
    return res.status(400).json({ ok: false, error: "Missing roomId." });
  }

  const parsed = addToQueueSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({ ok: false, error: issue.message });
  }
  const { videoId } = parsed.data;

  const userId = req.user!.userId;
  const userName = req.user!.username;

  try {
    const room = await prisma.room.findUnique({
      where: { roomId },
      select: { createdBy: true },
    });
    if (!room) {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }

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

    const item = await prisma.$transaction(async (tx) => {
      const last = await tx.roomQueueItem.findFirst({
        where: { roomId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const nextPosition = (last?.position ?? -1) + 1;
      return tx.roomQueueItem.create({
        data: {
          roomId,
          videoId,
          addedById: userId,
          addedByName: userName,
          position: nextPosition,
        },
      });
    });

    // Bump the room's lastUsedAt so cleanup-cron treats this as active.
    // Fire-and-forget — failure here is harmless.
    void prisma.room
      .update({ where: { roomId }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    const wireItem = {
      id: item.id,
      videoId: item.videoId,
      addedById: item.addedById,
      addedByName: item.addedByName,
      addedAt: item.addedAt.toISOString(),
      position: item.position,
    };

    const io = getIo();
    io?.to(`room:${roomId}`).emit("room.queue.added", { item: wireItem });

    return res.status(200).json({ ok: true, item: wireItem });
  } catch (err) {
    console.error("[rooms/queue/add] failed:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Couldn't add the video. Try again." });
  }
}
