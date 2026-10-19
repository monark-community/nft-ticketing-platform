-- Add ipfs_hash to TicketType for frozen ticket metadata CIDs
ALTER TABLE "TicketType" ADD COLUMN "ipfs_hash" TEXT;
