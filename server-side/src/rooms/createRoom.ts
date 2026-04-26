/**
 * POST /rooms/create
 *
 * Creates a new room owned by the authenticated user. Requires
 * `requireAuth` upstream so `req.user.userId` is populated.
 *
 * Body:
 *   { name: string }
 *
 * Response shapes:
 *   200 { ok: true, room: { roomId, name, createdAt, lastUsedAt } }
 *   400 { ok: false, error, field? }   // Zod validation failure
 *   401 (handled by requireAuth)        // missing/invalid/expired token
 *   409 { ok: false, error, reason: "limit-reached" }  // 5-room cap
 *   500 { ok: false, error }             // unexpected DB / runtime error
 *
 * The work is one interactive transaction so the three rows
 * (`Room`, `RoomSettings`, `RoomMember`) are inserted atomically.
 * `createdAt` and `lastUsedAt` are populated by the `@default(now())`
 * we baked into the schema migration — never passed in `data: {}`.
 */
import type { Request, Response } from "express";
import { prisma } from "../db";
import { createRoomSchema } from "./schemas";

/** Cap on rooms a user can own at once. They must delete some before creating more. */
export const ROOM_CREATION_CAP = 5;

export async function createRoomHandler(req: Request, res: Response) {
  const parsed = createRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path[0] as "name" | undefined;
    return res.status(400).json({ ok: false, error: issue.message, field });
  }

  const userId = req.user!.userId;

  try {
    // 5-room cap. Counted outside the transaction since concurrent creates
    // racing past the cap is acceptable (a user accidentally landing at 6
    // is harmless; they just delete one). Strict serialization isn't worth
    // the complexity at this scale.
    const existingCount = await prisma.room.count({
      where: { createdBy: userId },
    });
    if (existingCount >= ROOM_CREATION_CAP) {
      return res.status(409).json({
        ok: false,
        error: `You already have ${ROOM_CREATION_CAP} rooms. Delete one before creating another.`,
        reason: "limit-reached",
      });
    }

    const room = await prisma.$transaction(async (tx) => {
      const created = await tx.room.create({
        data: { name: parsed.data.name, createdBy: userId },
      });
      await tx.roomSettings.create({ data: { roomId: created.roomId } });
      await tx.roomMember.create({
        data: { userId, roomId: created.roomId, status: "LEADER" },
      });
      return created;
    });

    return res.status(200).json({
      ok: true,
      room: {
        roomId: room.roomId,
        name: room.name,
        createdAt: room.createdAt.toISOString(),
        lastUsedAt: room.lastUsedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("[rooms/create] failed:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Couldn't create the room. Try again." });
  }
}
