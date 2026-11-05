"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchOrganizerEvents, type OrganizerEvent } from "@/lib/organizer-events";

// The signed-in organizer's events from GET /api/events/mine (#187)
export function useOrganizerEvents() {
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0); // ignore responses from requests that were replaced

  const reload = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchOrganizerEvents();
      if (id !== request.current) return;
      setEvents(next);
    } catch (err) {
      if (id !== request.current) return;
      setError(err instanceof Error ? err.message : "Failed to fetch your events");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { events, loading, error, reload };
}
