"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiClient } from "@/lib/api";
import { appendEvents, type EventSummary, type EventsPage } from "@/lib/events";

// Three cards per row on desktop, so load three rows at a time
export const EVENTS_PAGE_SIZE = 9;

// Published events from GET /api/events, one page at a time (#283)
export function useEvents() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const request = useRef(0); // ignore responses from requests that were replaced

  const fetchPage = useCallback((n: number) => apiClient<EventsPage>(`/api/events?page=${n}&limit=${EVENTS_PAGE_SIZE}`), []);

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
    } catch (err) {
      if (id !== request.current) return;
      setError(err instanceof Error ? err.message : "Failed to fetch events");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [fetchPage]);

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

  useEffect(() => {
    // Load the first page on mount
    void reload();
  }, [reload]);

  const hasMore = events.length < total;

  return { events, total, loading, loadingMore, error, loadMoreError, hasMore, reload, loadMore };
}
