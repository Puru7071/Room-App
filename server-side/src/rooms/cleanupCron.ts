/**
 * Six-hourly safety-net cleanup for stale `Room` rows.
 *
 * A room is considered stale once `lastUsedAt` is more than 24 hours behind
 * `now()`. The API bumps `lastUsedAt` on every meaningful interaction
 * (join, chat, queue update), so an actively-used room won't be swept.
 *
 * One `prisma.room.deleteMany` is enough because the schema CASCADEs from
 * `Room` to `RoomMember`, `RoomInvite`, and `RoomSettings`. The
 * `@@index([lastUsedAt])` on `Room` makes the WHERE clause an indexed
 * range scan that's near-free even on a warm Neon instance.
 */

import cron from "node-cron";
import { prisma } from "../db";

/** Every 6 hours, on the hour. Four wake-ups/day. */
const CRON_EXPRESSION = "0 */6 * * *";
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function startStaleRoomCleanupCron() {
  cron.schedule(CRON_EXPRESSION, async () => {
    try {
      const cutoff = new Date(Date.now() - STALE_AFTER_MS);
      const { count } = await prisma.room.deleteMany({
        where: { lastUsedAt: { lt: cutoff } },
      });
      if (count > 0) {
        console.log(`[cron] swept ${count} stale Room row(s)`);
      }
    } catch (err) {
      console.error("[cron] stale Room cleanup failed:", err);
    }
  });
  console.log(`[cron] stale Room cleanup scheduled (${CRON_EXPRESSION})`);
}
