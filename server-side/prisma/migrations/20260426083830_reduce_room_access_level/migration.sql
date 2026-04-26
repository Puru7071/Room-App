-- Reduce `RoomAccessLevel` from {ALL, NOT_ALLOWED, ONLY_LEADERS} to {ALL, LIMITED}.
-- Postgres can't drop enum values directly — the safe ritual is:
--   1) create a new enum with the desired values,
--   2) cast each column to the new enum (mapping the going-away values to LIMITED),
--   3) drop the old enum,
--   4) rename the new enum back to the original name.
-- Wrapped in a transaction so a failure leaves nothing half-migrated.
BEGIN;

CREATE TYPE "RoomAccessLevel_new" AS ENUM ('ALL', 'LIMITED');

ALTER TABLE "RoomSettings"
  ALTER COLUMN "chatRights" DROP DEFAULT,
  ALTER COLUMN "chatRights" TYPE "RoomAccessLevel_new" USING (
    CASE "chatRights"::text
      WHEN 'ALL' THEN 'ALL'::"RoomAccessLevel_new"
      ELSE 'LIMITED'::"RoomAccessLevel_new"
    END
  ),
  ALTER COLUMN "chatRights" SET DEFAULT 'ALL'::"RoomAccessLevel_new";

ALTER TABLE "RoomSettings"
  ALTER COLUMN "videoAudioRights" DROP DEFAULT,
  ALTER COLUMN "videoAudioRights" TYPE "RoomAccessLevel_new" USING (
    CASE "videoAudioRights"::text
      WHEN 'ALL' THEN 'ALL'::"RoomAccessLevel_new"
      ELSE 'LIMITED'::"RoomAccessLevel_new"
    END
  ),
  ALTER COLUMN "videoAudioRights" SET DEFAULT 'ALL'::"RoomAccessLevel_new";

DROP TYPE "RoomAccessLevel";
ALTER TYPE "RoomAccessLevel_new" RENAME TO "RoomAccessLevel";

COMMIT;
