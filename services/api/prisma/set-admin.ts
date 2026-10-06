import { PrismaClient, Role } from "@prisma/client";
import { ethers } from "ethers";

// Promotes an existing user to ADMIN in the database. There is deliberately no
// API for this. The same wallet must also hold DEFAULT_ADMIN_ROLE on the contract
// (the deployer wallet does by default) to grant ORGANIZER_ROLE on-chain.
//
// Usage: npm run admin:set -- <wallet_address>

const prisma = new PrismaClient();

async function main() {
	const wallet = process.argv[2];

	if (!wallet || !ethers.isAddress(wallet)) {
		console.error("Usage: npm run admin:set -- <wallet_address>");
		process.exit(1);
	}

	const address = wallet.toLowerCase();
	const user = await prisma.user.findUnique({ where: { wallet_address: address } });

	if (!user) {
		console.error(`No user found for ${address}. Sign in with this wallet first.`);
		process.exit(1);
	}

	await prisma.user.update({ where: { wallet_address: address }, data: { role: Role.ADMIN } });
	console.log(`${address} is now an ADMIN.`);
}

main()
	.catch((err) => {
		console.error(err);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
