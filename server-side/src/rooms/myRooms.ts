/**
 * GET /rooms/mine
 *
 * Lists rooms created by the authenticated user. Powers the home-page
 * "My rooms" popover. Capped server-side at the same 5-room cap as
 * `createRoom`, but realistically returns 0–5 rows; pagination isn't
 * needed.
 *
 * Response:
 *   200 { ok: true, rooms: [{ roomId, name, createdAt, lastUsedAt }] }
 *   401 (handled by requireAuth)
 *   500 { ok: false, error }
 */
import type { Request, Response } from "express";
import { prisma } from "../db";

export async function myRoomsHandler(req: Request, res: Response) {
  const userId = req.user!.userId;

  try {
    const rooms = await prisma.room.findMany({
      where: { createdBy: userId },
      orderBy: { lastUsedAt: "desc" },
      select: {
        roomId: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });

    return res.status(200).json({
      ok: true,
      rooms: rooms.map((r) => ({
        roomId: r.roomId,
        name: r.name,
        createdAt: r.createdAt.toISOString(),
        lastUsedAt: r.lastUsedAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[rooms/mine] failed:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Couldn't load your rooms." });
  }
}
