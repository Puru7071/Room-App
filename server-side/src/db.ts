/**
 * Prisma client singleton.
 *
 * Prisma opens a connection pool on `new PrismaClient()`. If we instantiated
 * one per import, `tsx watch` hot-reloads in dev would leak pools until Postgres
 * starts refusing new connections. Keeping one instance on `globalThis` across
 * reloads fixes that.
 */

import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

export const prisma = global.__prisma__ ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma__ = prisma;
}
