// Mock data for local development: more events, past events, tickets, resale listings and
// organizer requests, so every page shows what it looks like in use. Only `npm run dev:fresh`
// adds it, on top of the dev seed (seed.ts); the end-to-end tests keep the dev seed alone.
//
// Two scripts read this file: prisma/seed-mock.ts writes the database side (users, events,
// ticket types, requests, guest lists, scanners) and packages/contracts/scripts/seed-mock.ts
// does the on-chain side (event setup, purchases, check-ins, listings, resales, withdrawals),
// which the API's listener saves into the database. All names, events and places are made up.
// Hardhat's test accounts only: their private keys are public, local use only.

// Hardhat accounts #0-#9: #0-#4 come from the dev seed, #5-#9 are added here
export const ACCOUNTS = {
	admin: { index: 0, wallet: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" },
	sophie: { index: 1, wallet: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" },
	alex: { index: 2, wallet: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc" },
	jordan: { index: 3, wallet: "0x90f79bf6eb2c4f870365e785982e1f101e93b906" },
	sam: { index: 4, wallet: "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65" },
	marcus: { index: 5, wallet: "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc" },
	priya: { index: 6, wallet: "0x976ea74026e726554db657fa54763abd0c3a0aa9" },
	noah: { index: 7, wallet: "0x14dc79964da2c08b23698b3d3cc7ca32193d9955" },
	chloe: { index: 8, wallet: "0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f" },
	ethan: { index: 9, wallet: "0xa0ee7a142d267c1f36714e4a8f75612f20a79720" },
} as const;
export type Person = keyof typeof ACCOUNTS;

// The new users. Marcus becomes an organizer when the chain seed grants him the role.
export const MOCK_USERS: { person: Person; first_name: string; last_name: string; email: string }[] = [
	{ person: "marcus", first_name: "Marcus", last_name: "Bell", email: "marcus@nfttickets.local" },
	{ person: "priya", first_name: "Priya", last_name: "Shah", email: "priya@nfttickets.local" },
	{ person: "noah", first_name: "Noah", last_name: "Tremblay", email: "noah@nfttickets.local" },
	{ person: "chloe", first_name: "Chloé", last_name: "Gagnon", email: "chloe@nfttickets.local" },
	{ person: "ethan", first_name: "Ethan", last_name: "Park", email: "ethan@nfttickets.local" },
];

// Organizer requests on the Admin page: three waiting, one turned down. Marcus's is approved
// when the chain seed grants him the role (the listener approves his open request).
export const MOCK_REQUESTS: {
	person: Person;
	organization_name: string;
	message: string;
	hoursAgo: number;
	rejected?: { reason: string; hoursAgo: number };
}[] = [
	// Before his past event (Ottawa Builds, 32 days ago)
	{ person: "marcus", organization_name: "Northern Lights Live", message: "We run club nights and sports events in Montréal and Ottawa, about 20 a year.", hoursAgo: 60 * 24 },
	{ person: "noah", organization_name: "Tremblay Sports Club", message: "Youth basketball tournaments, around 400 people each.", hoursAgo: 50 },
	{ person: "chloe", organization_name: "Les Productions Gagnon", message: "A theatre company in Gatineau. We'd like to sell our spring season here.", hoursAgo: 6 },
	{
		person: "ethan",
		organization_name: "Park Labs",
		message: "Monthly tech meetups.",
		hoursAgo: 7 * 24,
		rejected: { reason: "Please add a link to an event you've run before, then send a new request.", hoursAgo: 5 * 24 },
	},
];

// When something happens: a day relative to today at a set time (Ottawa time, wherever the seed
// runs: the API container's clock is in UTC), or hours from now
export type When = { days: number; hour: number; minute?: number } | { hours: number };

const TIME_ZONE = "America/Toronto";
const DAY_MS = 24 * 60 * 60 * 1000;

export function dateOf(when: When, now = Date.now()): Date {
	if ("hours" in when) return new Date(now + when.hours * 60 * 60 * 1000);
	const today = zonedParts(now);
	const day = new Date(Date.UTC(today.year, today.month - 1, today.day) + when.days * DAY_MS);
	return zonedTime(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), when.hour, when.minute ?? 0);
}

// The date and time on Ottawa's clocks at an instant
function zonedParts(at: number) {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: TIME_ZONE,
		hourCycle: "h23",
		year: "numeric",
		month: "numeric",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
	}).formatToParts(new Date(at));
	const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
	return { year: part("year"), month: part("month"), day: part("day"), hour: part("hour"), minute: part("minute") };
}

// The instant Ottawa's clocks show this date and time (month from 0), summer time included
function zonedTime(year: number, month: number, day: number, hour: number, minute: number): Date {
	const wanted = Date.UTC(year, month, day, hour, minute);
	let guess = wanted;
	for (let i = 0; i < 2; i++) {
		const shown = zonedParts(guess);
		guess += wanted - Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute);
	}
	return new Date(guess);
}

export interface MockTier {
	name: string;
	description: string;
	price: number; // USDC
	supply: number;
}

export interface MockEvent {
	slug: string; // the API id is `event-${slug}`, and the picture is /seed/${slug}.svg
	title: string;
	description: string;
	location: string;
	category: string;
	organizer: Person;
	start: When;
	end: When;
	picture: boolean;
	tiers: MockTier[];
	// DRAFT and FROZEN (waiting to publish) events only exist in the database
	status: "PUBLISHED" | "DRAFT" | "FROZEN";
	// Published events: their contract event ID and terms
	chain?: {
		id: number;
		royaltyBps: number;
		resaleCapBps: number;
		perWalletLimit: number;
		// Over: the event is in the past. The contract only takes an end time in the future, so
		// the chain seed gives it two minutes to sell; then it shows as over everywhere.
		past?: boolean;
		guestList?: Person[]; // presale, open to these wallets only
		scanners?: Person[];
	};
}

// Contract event IDs 1 and 2 are the dev seed's
export const MOCK_EVENTS: MockEvent[] = [
	{
		slug: "midnight-frequencies",
		title: "Midnight Frequencies",
		description: "Six hours of house and techno in a converted foundry, with a laser show from midnight. 18+.",
		location: "The Foundry, Montréal, QC",
		category: "Electronic Music",
		organizer: "marcus",
		start: { days: 9, hour: 22 },
		end: { days: 10, hour: 4 },
		picture: true,
		status: "PUBLISHED",
		chain: { id: 3, royaltyBps: 800, resaleCapBps: 15000, perWalletLimit: 6 },
		tiers: [
			{ name: "Early Entry", description: "In before 11 PM", price: 25, supply: 100 },
			{ name: "General Admission", description: "All night", price: 35, supply: 400 },
			{ name: "Backstage Pass", description: "Lounge and a meet and greet", price: 90, supply: 40 },
		],
	},
	{
		slug: "twelfth-night",
		title: "Twelfth Night in the Park",
		description: "Shakespeare's comedy of mistaken identities, played outdoors under the lanterns. Bring a blanket for the lawn.",
		location: "Strathcona Park, Ottawa, ON",
		category: "Theater & Arts",
		organizer: "sophie",
		start: { days: 16, hour: 19, minute: 30 },
		end: { days: 16, hour: 22 },
		picture: true,
		status: "PUBLISHED",
		chain: { id: 4, royaltyBps: 500, resaleCapBps: 12000, perWalletLimit: 4 },
		tiers: [
			{ name: "Lawn", description: "Bring a blanket", price: 12, supply: 500 },
			{ name: "Reserved Chair", description: "First rows, chairs provided", price: 24, supply: 150 },
		],
	},
	{
		slug: "capital-clash",
		title: "Capital Clash: Roller Derby Double-Header",
		description: "Two bouts back to back: Ottawa's league champions take on Montréal, then the all-star game.",
		location: "TD Place Arena, Ottawa, ON",
		category: "Sports & Arenas",
		organizer: "marcus",
		start: { days: 6, hour: 18 },
		end: { days: 6, hour: 22 },
		picture: true,
		status: "PUBLISHED",
		chain: { id: 5, royaltyBps: 1000, resaleCapBps: 20000, perWalletLimit: 4 },
		tiers: [
			{ name: "General Admission", description: "Bleachers", price: 18, supply: 600 },
			{ name: "Trackside", description: "Floor seats along the track", price: 40, supply: 60 },
		],
	},
	{
		slug: "chain-reaction",
		title: "Chain Reaction: Builders Summit",
		description: "A day of talks and workshops on building apps people actually use, from wallets to payments. Almost sold out.",
		location: "Shaw Centre, Ottawa, ON",
		category: "Web3 & Tech",
		organizer: "sophie",
		start: { days: 23, hour: 9 },
		end: { days: 23, hour: 18 },
		picture: true,
		status: "PUBLISHED",
		chain: { id: 6, royaltyBps: 1000, resaleCapBps: 15000, perWalletLimit: 0 },
		tiers: [
			{ name: "Conference Pass", description: "All talks, lunch included", price: 45, supply: 24 },
			{ name: "Workshop Add-on", description: "Afternoon hands-on workshop", price: 20, supply: 6 },
		],
	},
	{
		slug: "prairie-rodeo",
		title: "Prairie Rodeo Showdown",
		description: "Bronc riding, barrel racing and a chuckwagon finale, with a country band after sunset.",
		location: "Stampede Park, Calgary, AB",
		category: "Culture & Rodeo",
		organizer: "marcus",
		start: { days: 34, hour: 13 },
		end: { days: 34, hour: 19 },
		picture: true,
		status: "PUBLISHED",
		chain: { id: 7, royaltyBps: 1000, resaleCapBps: 20000, perWalletLimit: 8 },
		tiers: [
			{ name: "Grandstand", description: "Covered seats", price: 30, supply: 800 },
			{ name: "Infield", description: "Standing, next to the chutes", price: 55, supply: 120 },
			{ name: "Family Pack", description: "Four grandstand seats together", price: 95, supply: 50 },
		],
	},
	{
		slug: "rooftop-sessions",
		title: "Rooftop Sessions: Indie Night",
		description: "Three local indie bands on a rooftop downtown, with the city lights behind them.",
		location: "Rooftop at 99 Bank, Ottawa, ON",
		category: "Concerts",
		organizer: "sophie",
		start: { days: 3, hour: 20 },
		end: { days: 3, hour: 23 },
		picture: true,
		status: "PUBLISHED",
		chain: { id: 8, royaltyBps: 1000, resaleCapBps: 20000, perWalletLimit: 4 },
		tiers: [{ name: "General Admission", description: "Standing", price: 22, supply: 150 }],
	},
	{
		slug: "symphony-stars",
		title: "Symphony Under the Stars",
		description: "The city's chamber orchestra plays film scores in the park's bandshell. Sold out: look for resale tickets.",
		location: "Major's Hill Park, Ottawa, ON",
		category: "Classical & Opera",
		organizer: "sophie",
		start: { days: 12, hour: 20, minute: 30 },
		end: { days: 12, hour: 22, minute: 30 },
		picture: true,
		status: "PUBLISHED",
		chain: { id: 9, royaltyBps: 1000, resaleCapBps: 20000, perWalletLimit: 0 },
		tiers: [
			{ name: "Lawn", description: "Bring a chair or a blanket", price: 20, supply: 12 },
			{ name: "Front Rows", description: "Seats in front of the bandshell", price: 45, supply: 6 },
		],
	},
	{
		slug: "winter-lights",
		title: "Winter Lights Festival: Opening Night",
		description: "Ice sculptures, a light trail and skating under the northern lights show, with hot chocolate on the way.",
		location: "Confederation Park, Ottawa, ON",
		category: "Culture & Rodeo",
		organizer: "marcus",
		start: { days: 58, hour: 17 },
		end: { days: 58, hour: 22 },
		picture: true,
		status: "PUBLISHED",
		chain: { id: 10, royaltyBps: 500, resaleCapBps: 11000, perWalletLimit: 6 },
		tiers: [
			{ name: "Day Pass", description: "Light trail and sculptures", price: 10, supply: 2000 },
			{ name: "Skating & Cocoa", description: "Skate rental and a hot chocolate", price: 18, supply: 400 },
		],
	},
	{
		slug: "capital-hoops",
		title: "Capital Hoops Showcase",
		description: "The best university teams in the region, a three-point contest at half-time, and a dunk show.",
		location: "Canadian Tire Centre, Ottawa, ON",
		category: "Sports & Arenas",
		organizer: "marcus",
		start: { days: 27, hour: 19 },
		end: { days: 27, hour: 22 },
		picture: true,
		status: "PUBLISHED",
		chain: { id: 11, royaltyBps: 1200, resaleCapBps: 15000, perWalletLimit: 4 },
		tiers: [
			{ name: "Upper Bowl", description: "Upper level", price: 25, supply: 900 },
			{ name: "Lower Bowl", description: "Lower level", price: 60, supply: 300 },
			{ name: "Courtside", description: "Floor seats, first row", price: 180, supply: 20 },
		],
	},
	{
		slug: "nutcracker",
		title: "The Nutcracker",
		description: "The holiday ballet with a live orchestra. Presale for the guest list first, then everyone.",
		location: "National Arts Centre, Ottawa, ON",
		category: "Theater & Arts",
		organizer: "sophie",
		start: { days: 41, hour: 19 },
		end: { days: 41, hour: 21, minute: 30 },
		picture: true,
		status: "PUBLISHED",
		chain: { id: 12, royaltyBps: 1000, resaleCapBps: 12000, perWalletLimit: 4, guestList: ["alex", "priya"] },
		tiers: [
			{ name: "Orchestra", description: "Main floor", price: 85, supply: 200 },
			{ name: "Mezzanine", description: "First balcony", price: 55, supply: 250 },
			{ name: "Balcony", description: "Upper balcony", price: 35, supply: 300 },
		],
	},
	// Happening now, whenever you run dev:fresh: it started 3 hours ago and runs for 24
	{
		slug: "open-mic-marathon",
		title: "24-Hour Open Mic Marathon",
		description: "Local musicians take the café's stage in shifts for 24 hours straight, raising money for music lessons in schools. Come and go as you like.",
		location: "Le Café Atrium, Ottawa, ON",
		category: "Concerts",
		organizer: "sophie",
		start: { hours: -3 },
		end: { hours: 21 },
		picture: true,
		status: "PUBLISHED",
		chain: { id: 13, royaltyBps: 1000, resaleCapBps: 20000, perWalletLimit: 4, scanners: ["sam"] },
		tiers: [
			{ name: "Day Pass", description: "In and out all day", price: 15, supply: 120 },
			{ name: "Supporter Pass", description: "A day pass and a bigger donation", price: 40, supply: 40 },
		],
	},
	// Past events
	{
		slug: "harvest-moon",
		title: "Harvest Moon Folk Festival",
		description: "A day of folk and bluegrass on three stages, with food trucks and a lantern walk at night.",
		location: "Lansdowne Park, Ottawa, ON",
		category: "Concerts",
		organizer: "sophie",
		start: { days: -18, hour: 12 },
		end: { days: -18, hour: 23 },
		picture: true,
		status: "PUBLISHED",
		chain: { id: 14, royaltyBps: 1000, resaleCapBps: 20000, perWalletLimit: 4, past: true, scanners: ["sam"] },
		tiers: [
			{ name: "Day Pass", description: "All stages", price: 28, supply: 700 },
			{ name: "Weekend Pass", description: "Both days and the lantern walk", price: 49, supply: 300 },
		],
	},
	{
		slug: "autumn-strings",
		title: "Autumn Strings Quartet",
		description: "Haydn, Ravel and a new piece by a local composer, in a church with great acoustics.",
		location: "Dominion-Chalmers Centre, Ottawa, ON",
		category: "Classical & Opera",
		organizer: "sophie",
		start: { days: -4, hour: 19, minute: 30 },
		end: { days: -4, hour: 21, minute: 30 },
		picture: true,
		status: "PUBLISHED",
		chain: { id: 15, royaltyBps: 1000, resaleCapBps: 20000, perWalletLimit: 4, past: true, scanners: ["sam"] },
		tiers: [{ name: "General Admission", description: "Open seating", price: 30, supply: 180 }],
	},
	{
		slug: "ottawa-builds",
		title: "Ottawa Builds Hackathon",
		description: "Thirty-three hours to build something useful for the city, with mentors and prizes.",
		location: "Bayview Yards, Ottawa, ON",
		category: "Web3 & Tech",
		organizer: "marcus",
		start: { days: -32, hour: 9 },
		end: { days: -31, hour: 18 },
		picture: true,
		status: "PUBLISHED",
		chain: { id: 16, royaltyBps: 1000, resaleCapBps: 20000, perWalletLimit: 4, past: true, scanners: ["sam"] },
		tiers: [
			{ name: "Hacker", description: "Both days, meals included", price: 15, supply: 120 },
			{ name: "Sponsor Booth", description: "A table in the main hall", price: 250, supply: 10 },
		],
	},
	// Not on the chain: a draft, one waiting to publish, and a draft without a picture
	{
		slug: "spring-gala",
		title: "Spring Gala Fundraiser",
		description: "A dinner and silent auction for the youth orchestra.",
		location: "Château Laurier, Ottawa, ON",
		category: "Classical & Opera",
		organizer: "sophie",
		start: { days: 75, hour: 18 },
		end: { days: 75, hour: 23 },
		picture: true,
		status: "DRAFT",
		tiers: [
			{ name: "Dinner Ticket", description: "Dinner and the auction", price: 120, supply: 200 },
			{ name: "Table of Eight", description: "A reserved table", price: 900, supply: 20 },
		],
	},
	{
		slug: "chamber-candlelight",
		title: "Chamber Music by Candlelight",
		description: "A string quartet plays Vivaldi's Four Seasons by the light of a thousand candles.",
		location: "St. Bartholomew's Church, Ottawa, ON",
		category: "Classical & Opera",
		organizer: "sophie",
		start: { days: 50, hour: 19, minute: 30 },
		end: { days: 50, hour: 21 },
		picture: true,
		status: "FROZEN",
		tiers: [{ name: "Pew Seat", description: "Open seating", price: 32, supply: 120 }],
	},
	{
		slug: "bass-cathedral",
		title: "Bass Cathedral",
		description: "An all-night bass music event. Line-up to be announced.",
		location: "Théâtre Fairmount, Montréal, QC",
		category: "Electronic Music",
		organizer: "marcus",
		start: { days: 90, hour: 23 },
		end: { days: 91, hour: 5 },
		picture: false,
		status: "DRAFT",
		tiers: [{ name: "General Admission", description: "", price: 40, supply: 500 }],
	},
];

// Purchases, in order. `label` names the tickets bought, for the check-ins and listings below.
export const MOCK_PURCHASES: { label: string; event: string; buyer: Person; tier: number; quantity: number }[] = [
	// Past events first: they only take sales for a few minutes
	{ label: "alex-harvest", event: "harvest-moon", buyer: "alex", tier: 0, quantity: 2 },
	{ label: "priya-harvest", event: "harvest-moon", buyer: "priya", tier: 1, quantity: 1 },
	{ label: "noah-harvest", event: "harvest-moon", buyer: "noah", tier: 0, quantity: 2 },
	{ label: "alex-autumn", event: "autumn-strings", buyer: "alex", tier: 0, quantity: 1 },
	{ label: "ethan-autumn", event: "autumn-strings", buyer: "ethan", tier: 0, quantity: 2 },
	{ label: "noah-builds", event: "ottawa-builds", buyer: "noah", tier: 0, quantity: 2 },
	{ label: "chloe-builds", event: "ottawa-builds", buyer: "chloe", tier: 0, quantity: 1 },
	{ label: "ethan-builds", event: "ottawa-builds", buyer: "ethan", tier: 1, quantity: 1 },
	// Upcoming
	{ label: "alex-midnight", event: "midnight-frequencies", buyer: "alex", tier: 1, quantity: 2 },
	{ label: "priya-midnight", event: "midnight-frequencies", buyer: "priya", tier: 1, quantity: 4 },
	{ label: "noah-midnight", event: "midnight-frequencies", buyer: "noah", tier: 2, quantity: 2 },
	{ label: "chloe-twelfth", event: "twelfth-night", buyer: "chloe", tier: 1, quantity: 2 },
	{ label: "noah-clash", event: "capital-clash", buyer: "noah", tier: 1, quantity: 2 },
	{ label: "ethan-clash", event: "capital-clash", buyer: "ethan", tier: 0, quantity: 2 },
	{ label: "noah-summit", event: "chain-reaction", buyer: "noah", tier: 0, quantity: 10 },
	{ label: "priya-summit", event: "chain-reaction", buyer: "priya", tier: 0, quantity: 8 },
	{ label: "ethan-summit", event: "chain-reaction", buyer: "ethan", tier: 1, quantity: 4 },
	{ label: "ethan-rodeo", event: "prairie-rodeo", buyer: "ethan", tier: 2, quantity: 1 },
	{ label: "chloe-rodeo", event: "prairie-rodeo", buyer: "chloe", tier: 0, quantity: 2 },
	{ label: "alex-rooftop", event: "rooftop-sessions", buyer: "alex", tier: 0, quantity: 2 },
	{ label: "priya-rooftop", event: "rooftop-sessions", buyer: "priya", tier: 0, quantity: 2 },
	// Every ticket of Symphony Under the Stars
	{ label: "priya-symphony", event: "symphony-stars", buyer: "priya", tier: 0, quantity: 6 },
	{ label: "noah-symphony", event: "symphony-stars", buyer: "noah", tier: 0, quantity: 6 },
	{ label: "ethan-symphony", event: "symphony-stars", buyer: "ethan", tier: 1, quantity: 4 },
	{ label: "chloe-symphony", event: "symphony-stars", buyer: "chloe", tier: 1, quantity: 2 },
	{ label: "chloe-winter", event: "winter-lights", buyer: "chloe", tier: 0, quantity: 4 },
	{ label: "ethan-hoops", event: "capital-hoops", buyer: "ethan", tier: 1, quantity: 2 },
	{ label: "alex-nutcracker", event: "nutcracker", buyer: "alex", tier: 1, quantity: 2 },
	{ label: "priya-nutcracker", event: "nutcracker", buyer: "priya", tier: 0, quantity: 2 },
	{ label: "alex-open-mic", event: "open-mic-marathon", buyer: "alex", tier: 0, quantity: 2 },
	{ label: "chloe-open-mic", event: "open-mic-marathon", buyer: "chloe", tier: 1, quantity: 2 },
];

// Free tickets the organizer sends out (complimentary)
export const MOCK_ISSUED: { event: string; tier: number; to: Person[] }[] = [{ event: "twelfth-night", tier: 0, to: ["ethan", "noah"] }];

// Checked in by the scanner (#4): the first `count` tickets of each purchase
export const MOCK_CHECK_INS: { purchase: string; count: number }[] = [
	{ purchase: "alex-harvest", count: 2 },
	{ purchase: "priya-harvest", count: 1 },
	{ purchase: "noah-harvest", count: 1 },
	{ purchase: "ethan-autumn", count: 1 },
	{ purchase: "noah-builds", count: 2 },
	{ purchase: "chloe-builds", count: 1 },
	{ purchase: "chloe-open-mic", count: 1 },
];

// Resale listings on the Marketplace: ticket `ticket` (0 = the first) of a purchase, at `price`
// USDC. `boughtBy` buys it back off the Marketplace.
export const MOCK_LISTINGS: { purchase: string; ticket: number; price: number; boughtBy?: Person }[] = [
	{ purchase: "priya-midnight", ticket: 0, price: 52.5 }, // at the 1.5x cap
	{ purchase: "priya-midnight", ticket: 1, price: 45 },
	{ purchase: "noah-clash", ticket: 0, price: 60, boughtBy: "alex" },
	{ purchase: "noah-clash", ticket: 1, price: 72 },
	{ purchase: "noah-symphony", ticket: 0, price: 40 }, // a sold-out event, at the 2x cap
	{ purchase: "ethan-hoops", ticket: 0, price: 85 },
	{ purchase: "alex-rooftop", ticket: 1, price: 30 }, // Alex's own listing
	{ purchase: "priya-harvest", ticket: 0, price: 120 }, // used, so a collectible: no cap
];

// Organizers who take their sales revenue out of the contract
export const MOCK_WITHDRAWALS: { event: string }[] = [{ event: "harvest-moon" }];

// Test USDC added to each wallet (the dev seed already gave #2 and #3 1,000)
export const MOCK_USDC: Partial<Record<Person, number>> = { alex: 500, priya: 1500, noah: 1500, chloe: 1000, ethan: 1500 };
