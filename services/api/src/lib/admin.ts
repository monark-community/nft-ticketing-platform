import { ethers } from 'ethers';
import { Role } from '@prisma/client';
import { prisma } from './prisma';
import logger from './logger';

// Makes ADMIN_WALLET an admin in the database. This is deliberately the only
// way to create an admin: no API accepts a role from the client.
//
// The same wallet must also hold DEFAULT_ADMIN_ROLE on the contract (the
// deployer does by default) to grant ORGANIZER_ROLE from its own wallet.
export async function syncAdminFromEnv(): Promise<void> {
  const configured = process.env.ADMIN_WALLET?.trim();
  if (!configured) {
    logger.info('ADMIN_WALLET is not set; skipping the admin account sync.');
    return;
  }

  if (!ethers.isAddress(configured)) {
    logger.error('ADMIN_WALLET is not a valid wallet address; skipping the admin account sync.');
    return;
  }

  const wallet = configured.toLowerCase();
  await prisma.user.upsert({
    where: { wallet_address: wallet },
    update: { role: Role.ADMIN },
    create: { wallet_address: wallet, role: Role.ADMIN },
  });

  logger.info(`Admin wallet ${wallet} is set to ADMIN.`);
}
