/**
 * Shared "append a video to a room's queue" helper. Used by both:
 *
 *   - The direct-add HTTP handler (`addToQueue.ts`) when the caller has
 *     authority to add directly (owner, or `editAccess === "ALL"`).
 *   - The WS approve-add-request handler (`roomChannel.ts`) when the
 *     leader accepts a pending video-add request from a non-leader.
 *
 * Putting this in one place ensures the two paths can never drift —
 * both run the same transactional position assignment, both bump
 * `Room.lastUsedAt`, both emit the same `room.queue.added` broadcast
 * payload, all of which downstream clients depend on for consistent
 * reducer state.
 */

import { prisma } from "../../db";
import { getIo } from "../../ws";
import type { QueueItemWire } from "../../ws/types";

export type AppendQueueItemArgs = {
  roomId: string;
  videoId: string;
  addedById: string;
  addedByName: string;
};

/**
 * Insert a `RoomQueueItem` row at `max(position) + 1`, bump
 * `Room.lastUsedAt`, broadcast `room.queue.added`, and return the
 * wire-shaped item. Throws if the DB write fails — callers should
 * handle the rejection (the HTTP handler turns it into a 500; the WS
 * handler logs + drops).
 */
export async function appendQueueItem(
  args: AppendQueueItemArgs,
): Promise<QueueItemWire> {
  const { roomId, videoId, addedById, addedByName } = args;

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
        addedById,
        addedByName,
        position: nextPosition,
      },
    });
  });

  // Fire-and-forget — failure here is harmless to the queue add.
  void prisma.room
    .update({ where: { roomId }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  const wireItem: QueueItemWire = {
    id: item.id,
    videoId: item.videoId,
    addedById: item.addedById,
    addedByName: item.addedByName,
    addedAt: item.addedAt.toISOString(),
    position: item.position,
  };

  getIo()?.to(`room:${roomId}`).emit("room.queue.added", { item: wireItem });

  return wireItem;
}
