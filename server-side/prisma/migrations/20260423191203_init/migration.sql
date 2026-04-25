-- CreateTable
CREATE TABLE "StagedUser" (
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "profilePicUrl" TEXT,
    "password" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StagedUser_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "StagedUser_email_key" ON "StagedUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StagedUser_username_key" ON "StagedUser"("username");

-- CreateIndex
CREATE INDEX "StagedUser_expiresAt_idx" ON "StagedUser"("expiresAt");
