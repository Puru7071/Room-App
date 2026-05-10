import { prisma } from "../db";

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

