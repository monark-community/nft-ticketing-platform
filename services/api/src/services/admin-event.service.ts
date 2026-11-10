import { EventStatus, OrganizerRequestStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const ADMIN_EVENT_SEARCH_MAX = 100;
// More words than this are ignored, so a long pasted text can't build a huge query
const SEARCH_WORDS_MAX = 5;

// LIKE treats % and _ as wildcards, and Prisma passes them through, so a search for "50%" or
// "rock_n_roll" must escape them to match those characters only
function escapeLike(text: string) {
  return text.replace(/[\\%_]/g, '\\$&');
}

export interface AdminEventFilters {
  q?: string; // event title, or the organizer's name, organization or wallet
  live?: boolean; // true: published events only. false: events that aren't published yet
}

// Every event in every status for the admin's Events tab (#297), newest first. The sale settings
// are the listener's copy of the contract's, and stay null until the event is published.
export async function listAdminEvents(page: number, limit: number, filters: AdminEventFilters = {}) {
  const and: Prisma.EventWhereInput[] = [];
  if (filters.live === true) and.push({ status: EventStatus.PUBLISHED });
  if (filters.live === false) and.push({ status: { not: EventStatus.PUBLISHED } });

  // Each word must be in the title or in one of the organizer's names, so "sophie martin" finds
  // Sophie Martin's events and "gala sophie" finds her gala
  const words = (filters.q ?? '').split(/\s+/).filter(Boolean).slice(0, SEARCH_WORDS_MAX);
  for (const word of words) {
    const contains = { contains: escapeLike(word), mode: 'insensitive' } as const;
    and.push({
      OR: [
        { title: contains },
        { organizer_wallet: contains },
        {
          organizer: {
            OR: [
              { first_name: contains },
              { last_name: contains },
              { nickname: contains },
              { organizer_requests: { some: { status: OrganizerRequestStatus.APPROVED, organization_name: contains } } },
            ],
          },
        },
      ],
    });
  }

  const where: Prisma.EventWhereInput = { AND: and };
  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      // id breaks ties, so events created in the same instant keep their order from page to page
      orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        location: true,
        status: true,
        sale_active: true,
        presale_active: true,
        contract_event_id: true,
        start_date: true,
        end_date: true,
        royalty_bps: true,
        resale_cap_bps: true,
        per_wallet_limit: true,
        sales_end_at: true,
        ticket_types: { select: { sold: true, supply: true } },
        organizer: {
          select: {
            wallet_address: true,
            first_name: true,
            last_name: true,
            nickname: true,
            // Same rule as the Organizers tab: the name on the latest approved request
            organizer_requests: {
              where: { status: OrganizerRequestStatus.APPROVED },
              orderBy: { reviewed_at: 'desc' },
              take: 1,
              select: { organization_name: true },
            },
          },
        },
      },
    }),
    prisma.event.count({ where }),
  ]);

  return {
    events: events.map(({ ticket_types, organizer, ...event }) => ({
      ...event,
      organizer: {
        wallet: organizer.wallet_address,
        first_name: organizer.first_name,
        last_name: organizer.last_name,
        nickname: organizer.nickname,
        organization_name: organizer.organizer_requests[0]?.organization_name ?? null,
      },
      sold: ticket_types.reduce((sum, type) => sum + type.sold, 0),
      supply: ticket_types.reduce((sum, type) => sum + type.supply, 0),
    })),
    total,
    page,
    limit,
  };
}
