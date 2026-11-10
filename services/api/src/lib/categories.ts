// The fixed list of event categories. Keep it the same as EVENT_CATEGORIES in the web app
// (services/web/src/lib/create-event.ts): the create-event form, the filters and the badges use it.
export const EVENT_CATEGORIES = [
  'Concerts',
  'Theater & Arts',
  'Sports & Arenas',
  'Web3 & Tech',
  'Classical & Opera',
  'Electronic Music',
  'Culture & Rodeo',
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export function isEventCategory(value: string): value is EventCategory {
  return (EVENT_CATEGORIES as readonly string[]).includes(value);
}
