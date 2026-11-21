import { createHash } from "crypto";
import { EventStatus, OrganizerRequestStatus, PrismaClient, Role } from "@prisma/client";

import {
	ACCOUNTS,
	MOCK_CHECK_INS,
	MOCK_EVENTS,
	MOCK_ISSUED,
	MOCK_LISTINGS,
	MOCK_PURCHASES,
	MOCK_REQUESTS,
	MOCK_USERS,
	dateOf,
	type MockEvent,
} from "./mock-data";

// Mock data, database side (see mock-data.ts). `npm run dev:fresh` runs it unless you pass --bare:
//   npm run db:seed:mock               after seed.ts, before the chain's scripts/seed-mock.ts
//   npm run db:seed:mock -- --finish   after it: once the listener has saved the chain's side,
//                                      dates purchases and check-ins as if they happened over time

const prisma = new PrismaClient();
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SYNC_TIMEOUT_MS = 120_000;

const eventId = (event: MockEvent) => `event-${event.slug}`;
const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// A made-up IPFS CID (base32, like real ones) for an event waiting to publish. Nothing is pinned
// behind it: the event page only links to it.
function fakeCid(seed: string) {
	const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
	const bytes = createHash("sha256").update(`nftokenpass-mock:${seed}`).digest();
	let bits = "";
	for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
	let out = "";
	for (let i = 0; i + 5 <= bits.length; i += 5) out += alphabet[parseInt(bits.slice(i, i + 5), 2)];
	return `bafkrei${out}`;
}

async function main() {
	if (process.env.NODE_ENV === "production") {
		throw new Error("The mock data must not run in production.");
	}
	if (process.argv.includes("--finish")) return finish();
	const organizer = await prisma.user.findUnique({ where: { wallet_address: ACCOUNTS.sophie.wallet } });
	if (!organizer) throw new Error("Run the dev seed first (npm run db:seed): the mock events need its organizer.");

	console.log("Adding the mock data...");
	const now = Date.now();

	for (const user of MOCK_USERS) {
		const data = { first_name: user.first_name, last_name: user.last_name, email: user.email };
		await prisma.user.upsert({
			where: { wallet_address: ACCOUNTS[user.person].wallet },
			update: data,
			create: { wallet_address: ACCOUNTS[user.person].wallet, role: Role.USER, ...data },
		});
	}

	// Requests are replaced, so running this twice doesn't add them twice
	await prisma.organizerRequest.deleteMany({ where: { wallet: { in: MOCK_REQUESTS.map((r) => ACCOUNTS[r.person].wallet) } } });
	for (const request of MOCK_REQUESTS) {
		await prisma.organizerRequest.create({
			data: {
				wallet: ACCOUNTS[request.person].wallet,
				organization_name: request.organization_name,
				message: request.message,
				created_at: new Date(now - request.hoursAgo * HOUR),
				...(request.rejected
					? {
							status: OrganizerRequestStatus.REJECTED,
							rejection_reason: request.rejected.reason,
							reviewed_by: ACCOUNTS.admin.wallet,
							reviewed_at: new Date(now - request.rejected.hoursAgo * HOUR),
						}
					: { status: OrganizerRequestStatus.PENDING }),
			},
		});
	}

	for (const event of MOCK_EVENTS) {
		const frozen = event.status === "FROZEN";
		const data = {
			organizer_wallet: ACCOUNTS[event.organizer].wallet,
			title: event.title,
			description: event.description,
			location: event.location,
			category: event.category,
			start_date: dateOf(event.start, now),
			end_date: dateOf(event.end, now),
			// Drawings in services/web/public/seed, served by the web app itself
			image_url: event.picture ? `/seed/${event.slug}.svg` : null,
			ipfs_hash: frozen ? fakeCid(event.slug) : null,
			contract_event_id: event.chain ? BigInt(event.chain.id) : null,
			status: EventStatus[event.status],
		};
		await prisma.event.upsert({ where: { id: eventId(event) }, update: data, create: { id: eventId(event), ...data } });

		// One at a time, so created_at keeps the on-chain order (position = contract_type_id)
		for (const [typeId, tier] of event.tiers.entries()) {
			const id = `${eventId(event)}-${slugOf(tier.name)}`;
			const type = {
				event_id: eventId(event),
				name: tier.name,
				description: tier.description,
				price: tier.price.toFixed(2),
				supply: tier.supply,
				// sold starts at 0: the listener counts the chain seed's purchases
				sold: 0,
				contract_type_id: event.chain ? typeId : null,
				ipfs_hash: frozen ? fakeCid(`${event.slug}/${tier.name}`) : null,
			};
			await prisma.ticketType.upsert({ where: { id }, update: type, create: { id, ...type } });
		}

		// Not synced yet: the listener marks them synced when the chain seed adds them
		for (const person of event.chain?.scanners ?? []) {
			const wallet = ACCOUNTS[person].wallet;
			await prisma.scanner.upsert({
				where: { event_id_wallet: { event_id: eventId(event), wallet } },
				update: {},
				create: { event_id: eventId(event), wallet, assigned_by: ACCOUNTS[event.organizer].wallet },
			});
		}
		for (const person of event.chain?.guestList ?? []) {
			const wallet = ACCOUNTS[person].wallet;
			await prisma.whitelist.upsert({
				where: { event_id_wallet: { event_id: eventId(event), wallet } },
				update: {},
				create: { event_id: eventId(event), wallet, added_by: ACCOUNTS[event.organizer].wallet },
			});
		}
	}

	const published = MOCK_EVENTS.filter((e) => e.chain).length;
	console.log(`Mock data added: ${MOCK_USERS.length} users, ${MOCK_REQUESTS.length} organizer requests, ${MOCK_EVENTS.length} events (${published} for the chain).`);
	console.log("Next: once the API is running, run the chain side (packages/contracts: npx hardhat run scripts/seed-mock.ts --network localhost), then npm run db:seed:mock -- --finish.");
}

// The chain seed runs in a few seconds, so every purchase and check-in has today's date. Once the
// listener has saved them all, spread them out: tickets bought over the past days (before the
// event, for past events) and past events' check-ins at their doors.
async function finish() {
	const chainEvents = MOCK_EVENTS.filter((event) => event.chain);
	const eventIds = chainEvents.map(eventId);
	const expected = {
		tickets: MOCK_PURCHASES.reduce((sum, p) => sum + p.quantity, 0) + MOCK_ISSUED.reduce((sum, i) => sum + i.to.length, 0),
		checkIns: MOCK_CHECK_INS.reduce((sum, c) => sum + c.count, 0),
		listings: MOCK_LISTINGS.filter((l) => !l.boughtBy).length,
	};
	const counts = async () => ({
		tickets: await prisma.ticket.count({ where: { event_id: { in: eventIds } } }),
		checkIns: await prisma.checkinLog.count({ where: { ticket: { event_id: { in: eventIds } } } }),
		listings: await prisma.listing.count({ where: { ticket: { event_id: { in: eventIds } } } }),
	});

	console.log("Waiting for the API's listener to save the chain's mock data...");
	const deadline = Date.now() + SYNC_TIMEOUT_MS;
	let now = await counts();
	while (now.tickets < expected.tickets || now.checkIns < expected.checkIns || now.listings < expected.listings) {
		if (Date.now() > deadline) {
			throw new Error(`The listener saved ${JSON.stringify(now)} of ${JSON.stringify(expected)} within ${SYNC_TIMEOUT_MS / 1000}s. Is the API running?`);
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
		now = await counts();
	}

	const at = Date.now();
	for (const event of chainEvents) {
		const start = dateOf(event.start, at).getTime();
		const past = Boolean(event.chain!.past);
		const tickets = await prisma.ticket.findMany({ where: { event_id: eventId(event) }, include: { checkin_logs: true, listing: true } });
		for (const ticket of tickets) {
			const n = Number(ticket.token_id);
			// Bought 1 to 16 days earlier: before the event for a past one, before now for the others
			const boughtAt = new Date(Math.min(at, start) - (1 + (n % 16)) * DAY - (n % 9) * HOUR);
			await prisma.ticket.update({ where: { token_id: ticket.token_id }, data: { minted_at: boughtAt } });
			if (past && ticket.checkin_logs.length) {
				// At the door: from a quarter of an hour before the start to an hour after
				const checkedInAt = new Date(start - 15 * MINUTE + (n % 75) * MINUTE);
				await prisma.ticket.update({ where: { token_id: ticket.token_id }, data: { used_at: checkedInAt } });
				await prisma.checkinLog.updateMany({ where: { token_id: ticket.token_id }, data: { checked_in_at: checkedInAt } });
			}
			if (ticket.listing) {
				// Listed a few hours to a couple of days ago
				const listedAt = new Date(Math.max(boughtAt.getTime() + HOUR, at - (2 + (n % 46)) * HOUR));
				await prisma.listing.update({ where: { token_id: ticket.token_id }, data: { listed_at: listedAt } });
			}
		}
	}

	// Organizers approved on the chain: approved a day after they asked, not when the seed ran
	for (const request of MOCK_REQUESTS.filter((r) => !r.rejected)) {
		const approved = await prisma.organizerRequest.findFirst({ where: { wallet: ACCOUNTS[request.person].wallet, status: OrganizerRequestStatus.APPROVED } });
		if (approved) {
			await prisma.organizerRequest.update({ where: { id: approved.id }, data: { reviewed_at: new Date(approved.created_at.getTime() + 20 * HOUR) } });
		}
	}
	console.log(`Mock data finished: ${now.tickets} tickets, ${now.checkIns} check-ins and ${now.listings} listings dated.`);
}

main()
	.catch((error) => {
		console.error("Mock data error:", error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
