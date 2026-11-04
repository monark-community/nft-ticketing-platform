// API calls of the create event flow (#187, #193). They take the request function as a parameter
// (apiClient by default) so they can be tested with a fake one.

import { apiClient } from "@/lib/api";
import { planTicketTypeSync, toEventPayload, toTicketTypePayload, type DetailsForm, type TicketTypeForm } from "@/lib/create-event";
import { sortTicketTypes, type ApiEvent, type ApiTicketType } from "@/lib/event-details";

// GET /api/events/:id returns every column, including the IPFS hashes set by freeze
export type DraftTicketType = ApiTicketType & { ipfs_hash: string | null };
export type DraftEvent = Omit<ApiEvent, "ticket_types"> & { ipfs_hash: string | null; ticket_types: DraftTicketType[] };

type Request = <T>(path: string, options?: { method?: string; data?: unknown; body?: BodyInit }) => Promise<T>;
const defaultRequest: Request = (path, options) => apiClient(path, options);

export async function fetchDraft(eventId: string, request: Request = defaultRequest): Promise<DraftEvent> {
  const event = await request<DraftEvent>(`/api/events/${encodeURIComponent(eventId)}`);
  // Creation order is the on-chain type order (sortTicketTypes)
  return { ...event, ticket_types: sortTicketTypes(event.ticket_types) as DraftTicketType[] };
}

// Creates the draft (POST) or saves its details (PUT). Returns the event's id.
export async function saveDetails(eventId: string | null, details: DetailsForm, request: Request = defaultRequest): Promise<string> {
  const payload = toEventPayload(details);
  if (!eventId) {
    // A new event has no end date to clear, so leave it out instead of sending null
    const { end_date, ...rest } = payload;
    const created = await request<{ id: string }>("/api/events", { method: "POST", data: end_date ? payload : rest });
    return created.id;
  }
  await request(`/api/events/${encodeURIComponent(eventId)}`, { method: "PUT", data: payload });
  return eventId;
}

// Makes the API's ticket types match the form: deletes removed rows, updates changed ones, then
// creates new ones one at a time, in order, because creation order becomes the on-chain type order.
// On a failure it stops and returns the rows saved so far (with their new ids), so a retry
// doesn't create the same type twice.
export async function syncTicketTypes(
  eventId: string,
  form: TicketTypeForm[],
  saved: ApiTicketType[],
  request: Request = defaultRequest,
): Promise<{ types: TicketTypeForm[]; error: unknown | null }> {
  const plan = planTicketTypeSync(form, saved);
  const types = form.map((t) => ({ ...t }));
  try {
    for (const id of plan.remove) {
      await request(`/api/ticket-types/${encodeURIComponent(id)}`, { method: "DELETE" });
    }
    for (const type of plan.update) {
      await request(`/api/ticket-types/${encodeURIComponent(type.id as string)}`, { method: "PUT", data: toTicketTypePayload(type) });
    }
    for (const type of plan.create) {
      const created = await request<{ id: string }>(`/api/events/${encodeURIComponent(eventId)}/ticket-types`, {
        method: "POST",
        data: toTicketTypePayload(type),
      });
      const row = types.find((t) => t.key === type.key);
      if (row) row.id = created.id;
    }
    return { types, error: null };
  } catch (error) {
    return { types, error };
  }
}

export async function freezeDraft(eventId: string, image: File, request: Request = defaultRequest) {
  const body = new FormData();
  body.append("image", image, image.name);
  await request(`/api/events/${encodeURIComponent(eventId)}/freeze`, { method: "POST", body });
}

export async function publishDraft(eventId: string, contractEventId: bigint, request: Request = defaultRequest) {
  // As a string: JSON has no BigInt, and the API parses it with BigInt()
  await request(`/api/events/${encodeURIComponent(eventId)}/publish`, {
    method: "POST",
    data: { contract_event_id: contractEventId.toString() },
  });
}

// The API's error texts for the save steps, as something the organizer can act on
export function describeSaveError(err: unknown): string {
  const text = err instanceof Error ? err.message : "";
  if (/Forbidden: requires/.test(text)) {
    // The session was signed before the account became an organizer
    return "Your organizer access isn't active in this session yet. Sign out, sign in again, then save.";
  }
  if (/Not your event/.test(text)) {
    return "This wallet can't edit this event. Sign in with the organizer wallet that created it.";
  }
  if (/frozen/i.test(text)) return "This event is frozen, so its details and ticket types can't change anymore.";
  if (/email/i.test(text)) return "Add an email to your profile before creating events.";
  if (/Unauthorized/.test(text)) return "Your session expired. Sign in again to save.";
  if (/must be|required/i.test(text)) return `The server rejected a field: ${text}.`;
  return "Couldn't save the draft. Check your connection and try again.";
}
