import { EventStatus, PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

const users = [
	{
		wallet_address: "0x0000000000000000000000000000000000000001",
		email: "admin@nfttickets.local",
		first_name: "Admin",
		last_name: "User",
		role: Role.ADMIN,
	},
	{
		wallet_address: "0x0000000000000000000000000000000000000002",
		email: "organizer@nfttickets.local",
		first_name: "John",
		last_name: "Organizer",
		role: Role.ORGANIZER,
	},
	{
		wallet_address: "0x0000000000000000000000000000000000000003",
		email: "user@nfttickets.local",
		first_name: "Alice",
		last_name: "User",
		role: Role.USER,
	},
];

const events = [
	{
		id: "event-1",
		organizer_wallet: users[1].wallet_address,
		title: "Crypto Concert 2026",
		description: "A live concert celebrating blockchain technology.",
		location: "San Francisco, CA",
		category: "Concert",
		start_date: new Date("2026-11-15T20:00:00Z"),
		end_date: new Date("2026-11-15T23:00:00Z"),
		contract_event_id: 1n,
		status: EventStatus.PUBLISHED,
	},
	{
		id: "event-2",
		organizer_wallet: users[1].wallet_address,
		title: "NFT Art Expo 2026",
		description: "A digital art exhibition featuring NFT artists.",
		location: "New York, NY",
		category: "Exhibition",
		start_date: new Date("2026-12-01T10:00:00Z"),
		end_date: new Date("2026-12-05T18:00:00Z"),
		contract_event_id: 2n,
		status: EventStatus.PUBLISHED,
	},
];

const ticketTypes = [
	{
		id: "ticket-type-1",
		event_id: "event-1",
		name: "General Admission",
		description: "Standard event access.",
		price: "99.99",
		supply: 1000,
	},
	{
		id: "ticket-type-2",
		event_id: "event-2",
		name: "General Admission",
		description: "Standard exhibition access.",
		price: "149.99",
		supply: 500,
	},
];

async function main() {
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

	for (const ticketType of ticketTypes) {
		await prisma.ticketType.upsert({
			where: { id: ticketType.id },
			update: ticketType,
			create: ticketType,
		});
	}

	console.log("Database seed completed successfully.");
}

main()
	.catch((error) => {
		console.error("Seed error:", error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
