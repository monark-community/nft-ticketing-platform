"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiClient } from "@/lib/api";
import { appendEvents, eventsPath, NO_EVENT_FILTERS, type EventFilters, type EventSummary, type EventsPage } from "@/lib/events";

// Three cards per row on desktop, so load three rows at a time
export const EVENTS_PAGE_SIZE = 9;

// Published events from GET /api/events, one page at a time (#283), for the search and category
// given (#320). Pass a filters object that only changes when a filter does (state or a constant).
export function useEvents(filters: EventFilters = NO_EVENT_FILTERS, options: { enabled?: boolean; pageSize?: number } = {}) {
  const { enabled = true, pageSize = EVENTS_PAGE_SIZE } = options;
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  // How many events match the search in every category, for the "All events (24)" chip. Known
  // from the last response without a category; cleared when the search text changes.
  const [allCount, setAllCount] = useState<{ q: string; total: number } | null>(null);
  const request = useRef(0); // ignore responses from requests that were replaced

  const fetchPage = useCallback((n: number) => apiClient<EventsPage>(eventsPath(filters, n, pageSize)), [filters, pageSize]);

  const reload = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    setLoadMoreError(null);
    try {
      const result = await fetchPage(1);
      if (id !== request.current) return;
      setEvents(result.events);
      setTotal(result.total);
      setPage(1);
      if (!filters.category) setAllCount({ q: filters.q, total: result.total });
    } catch (err) {
      if (id !== request.current) return;
      setError(err instanceof Error ? err.message : "Failed to fetch events");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [fetchPage, filters]);

  const loadMore = useCallback(async () => {
    const id = request.current;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const result = await fetchPage(page + 1);
      if (id !== request.current) return;
      setEvents((current) => appendEvents(current, result.events));
      setTotal(result.total);
      setPage(page + 1);
    } catch (err) {
      if (id !== request.current) return;
      setLoadMoreError(err instanceof Error ? err.message : "Failed to fetch events");
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, page]);

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
    void reload();
  }, [reload, enabled]);

  const hasMore = events.length < total;
  const allTotal = allCount && allCount.q === filters.q ? allCount.total : null;

  return { events, total, allTotal, loading, loadingMore, error, loadMoreError, hasMore, reload, loadMore };
}
