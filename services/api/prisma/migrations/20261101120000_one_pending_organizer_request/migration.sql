-- Only one PENDING organizer request per wallet. Prisma can't express a partial
-- unique index in the schema, so it lives in the migration. The service also
-- turns the resulting P2002 into the same 409 as the findFirst check, so two
-- simultaneous requests can't create two open rows.
CREATE UNIQUE INDEX "OrganizerRequest_wallet_pending_key" ON "OrganizerRequest"("wallet") WHERE "status" = 'PENDING';
