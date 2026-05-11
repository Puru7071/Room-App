import { prisma } from "../db";

/** Room creator plus active co-owners (`SUB_LEADER`). Used for WS fan-out. */
export async function listElevatedModeratorUserIds(
  roomId: string,
): Promise<string[]> {
  const room = await prisma.room.findUnique({
    where: { roomId },
    select: { createdBy: true },
  });
  if (!room) return [];
  const coOwners = await prisma.roomMember.findMany({
    where: { roomId, isBanned: false, status: "SUB_LEADER" },
    select: { userId: true },
  });
  const ids = new Set<string>([room.createdBy]);
  for (const m of coOwners) ids.add(m.userId);
  return [...ids];
}

export async function isRoomCreator(
  userId: string,
  roomId: string,
): Promise<boolean> {
  const room = await prisma.room.findUnique({
    where: { roomId },
    select: { createdBy: true },
  });
  return Boolean(room && room.createdBy === userId);
}

export async function isElevatedRoomModerator(
  userId: string,
  roomId: string,
): Promise<boolean> {
  const room = await prisma.room.findUnique({
    where: { roomId },
    select: { createdBy: true },
  });
  if (!room) return false;
  if (room.createdBy === userId) return true;
  const member = await prisma.roomMember.findUnique({
    where: { userId_roomId: { userId, roomId } },
    select: { isBanned: true, status: true },
  });
  if (!member || member.isBanned) return false;
  return member.status === "SUB_LEADER";
}

