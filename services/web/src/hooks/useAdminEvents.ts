"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  adminEventsPath,
  hasSettings,
  withSettings,
  type AdminEvent,
  type AdminEventsPage,
  type AdminEventStatusFilter,
  type EventSettings,
} from "@/lib/admin-events";
import { apiClient } from "@/lib/api";

const SEARCH_DEBOUNCE_MS = 300;
// The API learns about a settings change from the listener, a few seconds after it confirms
const RELOAD_AFTER_SAVE_MS = [5_000, 10_000];

// Every event for the admin's Events tab (#296), one page at a time, with search and a status filter
export function useAdminEvents(enabled: boolean) {
  const [search, setSearch] = useState(""); // what is typed
  const [query, setQuery] = useState(""); // what is searched, once typing pauses
  const [status, setStatus] = useState<AdminEventStatusFilter>("all");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<AdminEventsPage | null>(null);
  const [allTotal, setAllTotal] = useState<number | null>(null); // without search or filter, for the tab's count
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Settings the admin just saved on-chain, shown until the API has them too
  const [saved, setSaved] = useState<Record<string, EventSettings>>({});

  const request = useRef(0); // ignore responses from requests that were replaced
  const timers = useRef<number[]>([]);

  // quiet: keep showing the current rows while the new ones load
  const load = useCallback(
    async (quiet = false) => {
      const id = ++request.current;
      const filtered = query !== "" || status !== "all";
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const [result, everything] = await Promise.all([
          apiClient<AdminEventsPage>(adminEventsPath({ q: query, status, page })),
          filtered ? apiClient<AdminEventsPage>(adminEventsPath({ limit: 1 })) : null,
        ]);
        if (id !== request.current) return;
        setData(result);
        setAllTotal(everything ? everything.total : result.total);
        // Stop overriding the rows the API has caught up on
        setSaved((current) => {
          const next = { ...current };
          for (const event of result.events) {
            if (next[event.id] && hasSettings(event, next[event.id])) delete next[event.id];
          }
          return Object.keys(next).length === Object.keys(current).length ? current : next;
        });
      } catch (err) {
        if (id !== request.current) return;
        // A failed background reload keeps the rows that are already on screen
        if (!quiet) setError(err instanceof Error ? err.message : "Could not load the events.");
      } finally {
        if (id === request.current) setLoading(false);
      }
    },
    [query, status, page],
  );

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  // The delayed reloads must use the filters and page of that moment, not of when they were set
  const latestLoad = useRef(load);
  useEffect(() => {
    latestLoad.current = load;
  }, [load]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  // Search once typing pauses, from the first page
  useEffect(() => {
    const next = search.trim();
    if (next === query) return;
    const timer = window.setTimeout(() => {
      setQuery(next);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search, query]);

  const changeStatus = useCallback((next: AdminEventStatusFilter) => {
    setStatus(next);
    setPage(1);
  }, []);

  // Show the new settings right away, then reload while the listener saves them. After the last
  // reload the API's values are shown again, whatever they are.
  const applySaved = useCallback((eventId: string, settings: EventSettings) => {
    setSaved((current) => ({ ...current, [eventId]: settings }));
    RELOAD_AFTER_SAVE_MS.forEach((delay, index) => {
      const last = index === RELOAD_AFTER_SAVE_MS.length - 1;
      timers.current.push(
        window.setTimeout(async () => {
          await latestLoad.current(true);
          if (last) setSaved((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== eventId)));
        }, delay),
      );
    });
  }, []);

  const events: AdminEvent[] = useMemo(
    () => (data?.events ?? []).map((event) => (saved[event.id] ? withSettings(event, saved[event.id]) : event)),
    [data, saved],
  );

  return {
    events,
    total: data?.total ?? 0, // matching the search and filter
    allTotal: allTotal ?? data?.total ?? 0,
    page,
    setPage,
    search,
    setSearch,
    status,
    setStatus: changeStatus,
    filtered: query !== "" || status !== "all",
    loading,
    loaded: data !== null,
    error,
    reload: load,
    applySaved,
  };
}

export type AdminEvents = ReturnType<typeof useAdminEvents>;
