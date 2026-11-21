"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiClient } from "@/lib/api";
import { appendEvents, eventsPath, joinPages, NO_EVENT_FILTERS, reloadPaths, type EventFilters, type EventSummary, type EventsPage } from "@/lib/events";

// Three cards per row on desktop, so load three rows at a time
export const EVENTS_PAGE_SIZE = 9;

// The last list shown for each set of filters, kept while the app stays open. Coming back from an
// event page shows it at once instead of placeholders, so the event's picture can shrink back
// into its card (#363); every page it had loaded is then refreshed quietly, so the cards show
// the stock as it is now.
interface RememberedList {
  events: EventSummary[];
  total: number;
  page: number;
  allCount: { q: string; total: number } | null; // for the "All events (24)" chip
}
const remembered = new Map<string, RememberedList>();

// Published events from GET /api/events, one page at a time (#283), for the search and category
// given (#320). Pass a filters object that only changes when a filter does (state or a constant).
export function useEvents(filters: EventFilters = NO_EVENT_FILTERS, options: { enabled?: boolean; pageSize?: number } = {}) {
  const { enabled = true, pageSize = EVENTS_PAGE_SIZE } = options;
  const listKey = eventsPath(filters, 1, pageSize);
  // Only read when the list is first shown: a filter change loads as before
  const [start] = useState(() => (enabled ? remembered.get(listKey) : undefined));
  const [events, setEvents] = useState<EventSummary[]>(start?.events ?? []);
  const [total, setTotal] = useState(start?.total ?? 0);
  const [page, setPage] = useState(start?.page ?? 0);
  const [loading, setLoading] = useState(enabled && !start);
  // The remembered list stays up while its first refresh runs. Any other load shows placeholders.
  const quietKey = useRef(start ? listKey : null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  // How many events match the search in every category, for the "All events (24)" chip. Known
  // from the last response without a category; cleared when the search text changes.
  const [allCount, setAllCount] = useState<{ q: string; total: number } | null>(start?.allCount ?? null);
  const request = useRef(0); // ignore responses from requests that were replaced

  const fetchPage = useCallback((n: number) => apiClient<EventsPage>(eventsPath(filters, n, pageSize)), [filters, pageSize]);

  // Loads the first `pages` pages: one, or every page a remembered list had loaded
  const load = useCallback(async (quiet: boolean, pages = 1) => {
    const id = ++request.current;
    if (!quiet) setLoading(true);
    setError(null);
    setLoadMoreError(null);
    try {
      const count = pages * pageSize;
      const answers = await Promise.all(reloadPaths(filters, count).map((path) => apiClient<EventsPage>(path)));
      if (id !== request.current) return;
      const result = joinPages(answers, count);
      // Fewer pages if the list got shorter meanwhile, so "Load more" goes on from the right place
      const loadedPages = Math.max(1, Math.ceil(result.events.length / pageSize));
      setEvents(result.events);
      setTotal(result.total);
      setPage(loadedPages);
      const all = filters.category ? null : { q: filters.q, total: result.total };
      remembered.set(listKey, { events: result.events, total: result.total, page: loadedPages, allCount: all });
      if (all) setAllCount(all);
    } catch (err) {
      if (id !== request.current) return;
      // A quiet refresh that fails keeps the remembered list on screen
      if (!quiet) setError(err instanceof Error ? err.message : "Failed to fetch events");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [filters, pageSize, listKey]);

  const reload = useCallback(() => load(false), [load]);

  const loadMore = useCallback(async () => {
    const id = request.current;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const result = await fetchPage(page + 1);
      if (id !== request.current) return;
      const all = appendEvents(events, result.events);
      setEvents(all);
      setTotal(result.total);
      setPage(page + 1);
      remembered.set(listKey, { events: all, total: result.total, page: page + 1, allCount: remembered.get(listKey)?.allCount ?? null });
    } catch (err) {
      if (id !== request.current) return;
      setLoadMoreError(err instanceof Error ? err.message : "Failed to fetch events");
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, page, events, listKey]);

  // With a category picked and the count for this search not known yet (a shared link, or the
  // search changed while a category was on), ask for it on its own: one event, just for the total
  const allCountKnown = allCount?.q === filters.q;
  useEffect(() => {
    if (!enabled || !filters.category || allCountKnown) return;
    let cancelled = false;
    apiClient<EventsPage>(eventsPath({ q: filters.q, category: "" }, 1, 1))
      .then((result) => {
        if (!cancelled) setAllCount({ q: filters.q, total: result.total });
      })
      .catch(() => {}); // the chip just shows no number
    return () => {
      cancelled = true;
    };
  }, [enabled, filters, allCountKnown]);

  useEffect(() => {
    if (!enabled) {
      request.current++;
      setEvents([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    // Load the first page on mount, and again whenever a filter changes
    if (quietKey.current !== listKey) quietKey.current = null; // a filter changed: no longer the remembered list
    const cameBack = quietKey.current === listKey;
    // Came back to a remembered list: every page it had loaded, refreshed in place
    void load(cameBack, cameBack ? (start?.page ?? 1) : 1);
  }, [load, enabled, listKey, start]);

  const hasMore = events.length < total;
  const allTotal = allCount && allCount.q === filters.q ? allCount.total : null;

  return { events, total, allTotal, loading, loadingMore, error, loadMoreError, hasMore, reload, loadMore };
}
