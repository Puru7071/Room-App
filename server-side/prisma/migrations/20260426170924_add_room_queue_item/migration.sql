-- CreateTable
CREATE TABLE "RoomQueueItem" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "addedByName" TEXT NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "position" INTEGER NOT NULL,

    CONSTRAINT "RoomQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomQueueItem_roomId_position_idx" ON "RoomQueueItem"("roomId", "position");

-- AddForeignKey
ALTER TABLE "RoomQueueItem" ADD CONSTRAINT "RoomQueueItem_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("roomId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomQueueItem" ADD CONSTRAINT "RoomQueueItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
