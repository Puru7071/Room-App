"use client";

import { CO_OWNER_ROLE } from "@/lib/room-types";
import { getRoomStore, useRoomStore } from "@/components/client/room/store/roomStore";

function computeElevated(
  members: { userId: string; role: string }[],
  userId: string | null | undefined,
  roomCreatedBy: string | null | undefined,
): boolean {
  const isOwner = Boolean(userId && roomCreatedBy && roomCreatedBy === userId);
  const myRole = userId
    ? (members.find((m) => m.userId === userId)?.role ?? null)
    : null;
  const isCoOwner = myRole === CO_OWNER_ROLE;
  return isOwner || isCoOwner;
}

/** Read-only authority for playback / queue jumps (editAccess + role). */
export function computeCanControlPlayback(
  roomId: string,
  userId: string | null | undefined,
  roomCreatedBy: string | null | undefined,
): boolean {
  const { roomSettings, members } = getRoomStore(roomId).getState();
  const editAccess = roomSettings?.editAccess ?? "LIMITED";
  return (
    computeElevated(members, userId, roomCreatedBy) || editAccess === "ALL"
  );
}

/** Read-only authority for chat send (chatRights + role). */
export function computeCanSendChat(
  roomId: string,
  userId: string | null | undefined,
  roomCreatedBy: string | null | undefined,
): boolean {
  const { roomSettings, members } = getRoomStore(roomId).getState();
  const chatRights = roomSettings?.chatRights ?? "LIMITED";
  return (
    computeElevated(members, userId, roomCreatedBy) || chatRights === "ALL"
  );
}

/**
 * Narrow subscription: `editAccess` + own membership role only.
 * Replacing `roomSettings` for unrelated fields does not rerender.
 */
export function useCanControlPlayback(
  roomId: string,
  currentUserId: string | null | undefined,
  roomCreatedBy: string | null | undefined,
): boolean {
  const editAccess = useRoomStore(
    roomId,
    (s) => s.roomSettings?.editAccess ?? "LIMITED",
  );
  const myRole = useRoomStore(
    roomId,
    (s) =>
      currentUserId
        ? (s.members.find((m) => m.userId === currentUserId)?.role ?? null)
        : null,
  );
  const isOwner = Boolean(
    currentUserId && roomCreatedBy && roomCreatedBy === currentUserId,
  );
  const isCoOwner = myRole === CO_OWNER_ROLE;
  const isElevated = isOwner || isCoOwner;
  return isElevated || editAccess === "ALL";
}

/**
 * Narrow subscription: `chatRights` + own membership role only.
 */
export function useCanSendChat(
  roomId: string,
  currentUserId: string | null | undefined,
  roomCreatedBy: string | null | undefined,
): boolean {
  const chatRights = useRoomStore(
    roomId,
    (s) => s.roomSettings?.chatRights ?? "LIMITED",
  );
  const myRole = useRoomStore(
    roomId,
    (s) =>
      currentUserId
        ? (s.members.find((m) => m.userId === currentUserId)?.role ?? null)
        : null,
  );
  const isOwner = Boolean(
    currentUserId && roomCreatedBy && roomCreatedBy === currentUserId,
  );
  const isCoOwner = myRole === CO_OWNER_ROLE;
  const isElevated = isOwner || isCoOwner;
  return isElevated || chatRights === "ALL";
}
