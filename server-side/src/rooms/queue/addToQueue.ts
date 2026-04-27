/**
 * POST /rooms/:roomId/queue
 *
 * Two paths depending on the room's `editAccess` setting:
 *
 *   - **`editAccess === "ALL"`** (or caller is owner): direct add. The
 *     transactional position assignment + `room.queue.added` broadcast
 *     are handled by `appendQueueItem` (shared with the WS approve
 *     handler). Returns 200 with `status: "added"` + the new item.
 *
 *   - **`editAccess === "LIMITED"` and caller is NOT owner**: create
 *     an in-memory video-add request, emit `room.add-request.created`
 *     to the leader's user channel so their broadcaster panel shows a
 *     pending card. Returns 202 with `status: "request-pending"` + the
 *     request id. The leader then approves/rejects via WS.
 *
 * Body: { videoId: string }
 *
 * Response (success):
 *   200 { ok: true, status: "added", item }
 *   202 { ok: true, status: "request-pending", requestId }
 *
 * Response (failure):
 *   400 { ok: false, error }    // missing roomId / invalid body
 *   401 (handled by requireAuth)
 *   403 { ok: false, error }    // caller is not a room member
 *   404 { ok: false, error }    // room doesn't exist
 *   500 { ok: false, error }
 */
import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { getIo } from "../../ws";
import { addAddRequest } from "../../ws/addRequests";
import { appendQueueItem } from "./queueShared";

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
      include: { settings: true },
    });
    if (!room) {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }

    const isOwner = room.createdBy === userId;
    if (!isOwner) {
      const member = await prisma.roomMember.findUnique({
        where: { userId_roomId: { userId, roomId } },
      });
      if (!member || member.isBanned) {
        return res
          .status(403)
          .json({ ok: false, error: "You're not a member of this room." });
      }
    }

    // LIMITED edit-access + non-owner → request flow.
    if (room.settings?.editAccess === "LIMITED" && !isOwner) {
      const reqRow = addAddRequest(roomId, { userId, userName }, videoId);
      getIo()
        ?.to(`user:${room.createdBy}`)
        .emit("room.add-request.created", { request: reqRow });
      return res.status(202).json({
        ok: true,
        status: "request-pending",
        requestId: reqRow.id,
      });
    }

    // Direct add (owner, or `editAccess === "ALL"`).
    const wireItem = await appendQueueItem({
      roomId,
      videoId,
      addedById: userId,
      addedByName: userName,
    });
    return res.status(200).json({ ok: true, status: "added", item: wireItem });
  } catch (err) {
    console.error("[rooms/queue/add] failed:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Couldn't add the video. Try again." });
  }
}
