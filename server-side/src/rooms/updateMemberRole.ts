import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { isElevatedRoomModerator } from "./roleAuth";
import { getIo } from "../ws";

const updateMemberRoleSchema = z.object({
  role: z.enum(["VIEWER", "SUB_LEADER"]),
});

export async function updateMemberRoleHandler(req: Request, res: Response) {
  const roomId = typeof req.params.roomId === "string" ? req.params.roomId : "";
  const targetUserId =
    typeof req.params.userId === "string" ? req.params.userId : "";
  if (!roomId || !targetUserId) {
    return res.status(400).json({ ok: false, error: "Missing roomId or userId." });
  }
  const parsed = updateMemberRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({ ok: false, error: issue.message });
  }
  const actorUserId = req.user!.userId;

  try {
    const room = await prisma.room.findUnique({
      where: { roomId },
      select: { roomId: true, createdBy: true },
    });
    if (!room) {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }
    if (targetUserId === room.createdBy) {
      return res
        .status(400)
        .json({ ok: false, error: "Owner role cannot be changed." });
    }
    const actorCanManage = await isElevatedRoomModerator(actorUserId, roomId);
    if (!actorCanManage) {
      return res.status(403).json({ ok: false, error: "Forbidden." });
    }

    // Demoting to VIEWER (from co-owner) is owner-only; co-owners cannot demote each other.
    if (parsed.data.role === "VIEWER" && actorUserId !== room.createdBy) {
      return res.status(403).json({
        ok: false,
        error: "Only the room owner can demote a co-owner.",
      });
    }

    const targetMember = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: targetUserId, roomId } },
      select: { userId: true, isBanned: true },
    });
    if (!targetMember || targetMember.isBanned) {
      return res.status(404).json({ ok: false, error: "Member not found." });
    }

    const updated = await prisma.roomMember.update({
      where: { userId_roomId: { userId: targetUserId, roomId } },
      data: { status: parsed.data.role },
      select: { status: true },
    });

    const role = updated.status === "SUB_LEADER" ? "co-owner" : "member";

    getIo()?.to(`room:${roomId}`).emit("room.member.role-updated", {
      roomId,
      userId: targetUserId,
      role,
    });

    return res.status(200).json({ ok: true, role });
  } catch (err) {
    console.error("[rooms/member-role/update] failed:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Couldn't update member role." });
  }
}

