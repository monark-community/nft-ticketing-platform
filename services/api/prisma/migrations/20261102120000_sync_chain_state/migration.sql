-- Chain state the blockchain listener copies into the database (#215, #216, #299):
-- event settings and sale status, each ticket type's contract type ID, what each ticket cost,
-- active resale listings and revenue withdrawals.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "per_wallet_limit" INTEGER,
ADD COLUMN     "presale_active" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resale_cap_bps" INTEGER,
ADD COLUMN     "royalty_bps" INTEGER,
ADD COLUMN     "sale_active" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sales_end_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "face_value" DECIMAL(18,8),
ADD COLUMN     "mint_tx_hash" TEXT,
ADD COLUMN     "purchase_price" DECIMAL(18,8);

-- AlterTable
ALTER TABLE "TicketType" ADD COLUMN     "contract_type_id" INTEGER;

-- CreateTable
CREATE TABLE "Listing" (
    "token_id" BIGINT NOT NULL,
    "seller_wallet" TEXT NOT NULL,
    "price" DECIMAL(18,8) NOT NULL,
    "listed_at" TIMESTAMP(3) NOT NULL,
    "tx_hash" TEXT,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("token_id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "organizer_wallet" TEXT NOT NULL,
    "amount" DECIMAL(18,8) NOT NULL,
    "withdrawn_at" TIMESTAMP(3) NOT NULL,
    "tx_hash" TEXT,
    "log_index" INTEGER,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Listing_price_idx" ON "Listing"("price");

-- CreateIndex
CREATE INDEX "Listing_listed_at_idx" ON "Listing"("listed_at");

-- CreateIndex
CREATE INDEX "Withdrawal_event_id_idx" ON "Withdrawal"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_tx_hash_log_index_key" ON "Withdrawal"("tx_hash", "log_index");

-- CreateIndex
CREATE INDEX "Ticket_owner_wallet_idx" ON "Ticket"("owner_wallet");

-- CreateIndex
CREATE UNIQUE INDEX "TicketType_event_id_contract_type_id_key" ON "TicketType"("event_id", "contract_type_id");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "Ticket"("token_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
