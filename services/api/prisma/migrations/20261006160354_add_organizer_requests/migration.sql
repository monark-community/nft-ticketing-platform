-- CreateEnum
CREATE TYPE "OrganizerRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "OrganizerRequest" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "organization_name" TEXT,
    "message" TEXT,
    "status" "OrganizerRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "tx_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizerRequest_wallet_status_idx" ON "OrganizerRequest"("wallet", "status");

-- AddForeignKey
ALTER TABLE "OrganizerRequest" ADD CONSTRAINT "OrganizerRequest_wallet_fkey" FOREIGN KEY ("wallet") REFERENCES "User"("wallet_address") ON DELETE CASCADE ON UPDATE CASCADE;

