-- Rename, not drop+add — preserves any existing values in `chatRestriction`.
-- Prisma's diff would have generated a destructive drop/add, so this
-- migration is hand-written.
ALTER TABLE "RoomSettings" RENAME COLUMN "chatRestriction" TO "chatRights";
