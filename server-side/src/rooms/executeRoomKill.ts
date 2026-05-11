/**
 * Hard-delete a room (creator only), broadcast `room.killed` to everyone
 * on the Socket.IO `room:` channel, and purge in-memory WS state for
 * that room. Used by HTTP DELETE /rooms/:id and `room.kill` WebSocket.
 */
import type { Server as IOServer } from "socket.io";
import { prisma } from "../db";
import { clearAddRequestsForRoom } from "../ws/addRequests";
import { clearChatForRoom } from "../ws/chatMessages";
import { clearJoinRequestsForRoom } from "../ws/joinRequests";

export type ExecuteRoomKillResult =
  | { ok: true }
  | { ok: false; error: "not-found" | "forbidden" | "db-error" };

export async function executeRoomKill(
  io: IOServer | null,
  requesterUserId: string,
  roomIdRaw: string,
): Promise<ExecuteRoomKillResult> {
  const roomId = roomIdRaw.trim();
  if (!roomId) {
    return { ok: false, error: "not-found" };
  }

  try {
    const room = await prisma.room.findUnique({
      where: { roomId },
      select: { roomId: true, createdBy: true },
    });
    if (!room) {
      return { ok: false, error: "not-found" };
    }
    if (room.createdBy !== requesterUserId) {
      return { ok: false, error: "forbidden" };
    }

    const rid = room.roomId;

    await prisma.room.delete({ where: { roomId: rid } });

    clearJoinRequestsForRoom(rid);
    clearAddRequestsForRoom(rid);
    clearChatForRoom(rid);

    io?.to(`room:${rid}`).emit("room.killed", { roomId: rid });
    return { ok: true };
  } catch (err) {
    console.error("[rooms/kill] failed:", err);
    return { ok: false, error: "db-error" };
  }
}
