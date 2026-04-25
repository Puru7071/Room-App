/**
 * Hourly safety-net cleanup for expired `StagedUser` rows.
 *
 * The signup handler already sweeps expired rows on every /auth/signup call
 * (see `signup.ts` step 2), so in normal traffic no staged row lingers long.
 * This cron exists solely to catch long idle periods with zero signups. Every
 * hour is plenty — correctness doesn't depend on it (verify-otp filters by
 * `expiresAt` on read), and the `@@index([expiresAt])` makes the DELETE an
 * indexed range scan that's near-free even on a warm Neon instance.
 */

import cron from "node-cron";
import { prisma } from "../db";

/** Top of every hour. Cheap in compute-time on Neon (24 wake-ups/day). */
const CRON_EXPRESSION = "0 * * * *";

export function startStagedUserCleanupCron() {
  cron.schedule(CRON_EXPRESSION, async () => {
    try {
      const { count } = await prisma.stagedUser.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (count > 0) {
        console.log(`[cron] swept ${count} expired StagedUser row(s)`);
      }
    } catch (err) {
      console.error("[cron] StagedUser cleanup failed:", err);
    }
  });
  console.log(`[cron] StagedUser cleanup scheduled (${CRON_EXPRESSION})`);
}
