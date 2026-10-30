import { EventStatus, PrismaClient, Role } from "@prisma/client";

// Local dev seed (#40). The database side of packages/contracts/scripts/seed.ts:
// the wallets are Hardhat's default test accounts and the events match the ones the
// on-chain seed creates, so you can sign in with MetaMask and buy tickets locally.
// Hardhat's test keys are public: local use only.

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number, hour: number) => {
	const date = new Date(Date.now() + days * DAY);
	date.setHours(hour, 0, 0, 0);
	return date;
};

// Hardhat accounts #0-#4, lowercased like the API stores them
const wallets = {
	admin: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
	organizer: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
	attendee: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
	attendee2: "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
	scanner: "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65",
};

const users = [
	{ wallet_address: wallets.admin, email: "admin@nfttickets.local", first_name: "Dev", last_name: "Admin", role: Role.ADMIN },
	{ wallet_address: wallets.organizer, email: "organizer@nfttickets.local", first_name: "Sophie", last_name: "Martin", role: Role.ORGANIZER },
	{ wallet_address: wallets.attendee, email: "user@nfttickets.local", first_name: "Alex", last_name: "Vance", role: Role.USER },
	{ wallet_address: wallets.attendee2, email: "user2@nfttickets.local", first_name: "Jordan", last_name: "Lee", role: Role.USER },
	// The scanner needs a user row: check-in logs reference it
	{ wallet_address: wallets.scanner, email: "scanner@nfttickets.local", first_name: "Sam", last_name: "Door", role: Role.SCANNER },
];

// contract_event_id must match GALA_EVENT_ID and PRESALE_EVENT_ID in the on-chain seed
const events = [
	{
		id: "event-1",
		organizer_wallet: wallets.organizer,
		title: "Gala Opera Concert",
		description:
			"The National Symphony Orchestra invites patrons to an unforgettable evening of operatic masterworks at the acoustic crown jewel of Ottawa.",
		location: "National Arts Centre, Ottawa, ON",
		category: "Classical & Opera",
		start_date: inDays(30, 18),
		end_date: inDays(30, 21),
		contract_event_id: 1n,
		status: EventStatus.PUBLISHED,
	},
	{
		id: "event-2",
		organizer_wallet: wallets.organizer,
		title: "Jazz at the Atrium",
		description: "An intimate night of modern jazz. Presale is open to the guest list first.",
		location: "National Arts Centre, Ottawa, ON",
		category: "Concerts",
		start_date: inDays(45, 19),
		end_date: inDays(45, 22),
		contract_event_id: 2n,
		status: EventStatus.PUBLISHED,
	},
];

// Same tiers, in the same order, as the on-chain seed. Until #216 adds contract_type_id,
// the order is what links each row to its on-chain type ID (0, 1, 2).
const tiers = [
	{ slug: "general-admission", name: "General Admission", description: "Orchestra floor seating", price: "15.00", supply: 1000 },
	{ slug: "vip", name: "VIP", description: "Balcony box and reception", price: "28.00", supply: 300 },
	{ slug: "early-bird", name: "Early Bird", description: "Discounted early tickets", price: "10.00", supply: 2 },
];

const ticketTypes = events.flatMap((event) =>
	tiers.map(({ slug, ...tier }) => ({ id: `${event.id}-${slug}`, event_id: event.id, ...tier })),
);

async function main() {
	if (process.env.NODE_ENV === "production") {
		throw new Error("The dev seed must not run in production.");
	}

	console.log("Starting database seed...");

	for (const user of users) {
		await prisma.user.upsert({
			where: { wallet_address: user.wallet_address },
			update: user,
			create: user,
		});
	}

	for (const event of events) {
		await prisma.event.upsert({
			where: { id: event.id },
			update: event,
			create: event,
		});
	}

	// One at a time, so created_at keeps the on-chain order
	for (const ticketType of ticketTypes) {
		await prisma.ticketType.upsert({
			where: { id: ticketType.id },
			update: ticketType,
			create: ticketType,
		});
	}

	// Not synced yet: the listener marks them synced when the on-chain seed runs
	await prisma.scanner.upsert({
		where: { event_id_wallet: { event_id: "event-1", wallet: wallets.scanner } },
		update: {},
		create: { event_id: "event-1", wallet: wallets.scanner, assigned_by: wallets.organizer },
	});
	await prisma.whitelist.upsert({
		where: { event_id_wallet: { event_id: "event-2", wallet: wallets.attendee } },
		update: {},
		create: { event_id: "event-2", wallet: wallets.attendee, added_by: wallets.organizer },
	});

	console.log("Database seed completed successfully.");
	console.log("Next: start the API, then run the on-chain seed (packages/contracts: npx hardhat run scripts/seed.ts --network localhost).");
}

main()
	.catch((error) => {
		console.error("Seed error:", error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
