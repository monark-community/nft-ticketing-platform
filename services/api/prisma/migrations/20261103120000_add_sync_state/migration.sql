-- How far the blockchain listener has read, so it can catch up after a restart (#119)

-- CreateTable
CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL,
    "last_block" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("id")
);
