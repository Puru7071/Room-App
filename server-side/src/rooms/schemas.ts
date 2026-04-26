/**
 * Zod request schemas for `/rooms/*` endpoints. Mirrors the shape of
 * `auth/schemas.ts` so handler validation logic stays consistent.
 *
 * Shared constants are exported so the client can import the same
 * bounds (room-name length, etc.) instead of redeclaring them.
 */
import { z } from "zod";

export const ROOM_NAME_MIN = 1;
export const ROOM_NAME_MAX = 80;

export const ROOM_NAME_REQUIRED_MSG = "Give your room a name.";
export const ROOM_NAME_TOO_LONG_MSG = `Room name can be at most ${ROOM_NAME_MAX} characters.`;

export const createRoomSchema = z.object({
  name: z
    .string()
    .trim()
    .min(ROOM_NAME_MIN, ROOM_NAME_REQUIRED_MSG)
    .max(ROOM_NAME_MAX, ROOM_NAME_TOO_LONG_MSG),
});
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

const roomNatureEnum = z.enum(["PUBLIC", "PRIVATE"]);
const roomEditAccessEnum = z.enum(["ALL", "LIMITED"]);
const roomAccessLevelEnum = z.enum(["ALL", "LIMITED"]);

/**
 * Body for `PATCH /rooms/:roomId/settings`. All fields optional —
 * callers send only the keys they want to change. Refined to require
 * at least one key so an empty body is a 400 instead of a no-op
 * write that bumps `lastUsedAt` for nothing.
 */
export const updateSettingsSchema = z
  .object({
    nature: roomNatureEnum.optional(),
    loop: z.boolean().optional(),
    editAccess: roomEditAccessEnum.optional(),
    chatRights: roomAccessLevelEnum.optional(),
    videoAudioRights: roomAccessLevelEnum.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one setting to update.",
  });
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
