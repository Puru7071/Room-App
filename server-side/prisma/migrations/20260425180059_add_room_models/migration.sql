-- CreateEnum
CREATE TYPE "RoomMemberStatus" AS ENUM ('VIEWER', 'LEADER', 'SUB_LEADER');

-- CreateEnum
CREATE TYPE "RoomNature" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "RoomEditAccess" AS ENUM ('ALL', 'LIMITED');

-- CreateEnum
CREATE TYPE "RoomAccessLevel" AS ENUM ('ALL', 'NOT_ALLOWED', 'ONLY_LEADERS');

-- CreateTable
CREATE TABLE "Room" (
    "roomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("roomId")
);

-- CreateTable
CREATE TABLE "RoomMember" (
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "status" "RoomMemberStatus" NOT NULL DEFAULT 'VIEWER',
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomMember_pkey" PRIMARY KEY ("userId","roomId")
);

-- CreateTable
CREATE TABLE "RoomInvite" (
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,

    CONSTRAINT "RoomInvite_pkey" PRIMARY KEY ("userId","roomId")
);

-- CreateTable
CREATE TABLE "RoomSettings" (
    "roomId" TEXT NOT NULL,
    "nature" "RoomNature" NOT NULL DEFAULT 'PRIVATE',
    "loop" BOOLEAN NOT NULL DEFAULT false,
    "editAccess" "RoomEditAccess" NOT NULL DEFAULT 'LIMITED',
    "chatRestriction" "RoomAccessLevel" NOT NULL DEFAULT 'ALL',
    "videoAudioRights" "RoomAccessLevel" NOT NULL DEFAULT 'ALL',

    CONSTRAINT "RoomSettings_pkey" PRIMARY KEY ("roomId")
);

-- CreateIndex
CREATE INDEX "Room_lastUsedAt_idx" ON "Room"("lastUsedAt");

-- CreateIndex
CREATE INDEX "Room_createdBy_idx" ON "Room"("createdBy");

-- CreateIndex
CREATE INDEX "RoomMember_roomId_idx" ON "RoomMember"("roomId");

-- CreateIndex
CREATE INDEX "RoomInvite_roomId_idx" ON "RoomInvite"("roomId");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("roomId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomInvite" ADD CONSTRAINT "RoomInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomInvite" ADD CONSTRAINT "RoomInvite_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("roomId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomSettings" ADD CONSTRAINT "RoomSettings_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("roomId") ON DELETE CASCADE ON UPDATE CASCADE;
