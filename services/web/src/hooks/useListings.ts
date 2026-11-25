"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiClient } from "@/lib/api";
import { appendListings, listingsPath, type Listing, type ListingFilters, type ListingsPage } from "@/lib/marketplace";

// Three cards per row on desktop, so load three rows at a time
export const LISTINGS_PAGE_SIZE = 9;

// Active resale listings from GET /api/listings (#315), one page at a time, for the filters given.
// seller: only that wallet's listings ("Your listings"), all on one page.
export function useListings(filters: ListingFilters, options: { seller?: string; enabled?: boolean; pageSize?: number } = {}) {
  const { seller, enabled = true, pageSize = LISTINGS_PAGE_SIZE } = options;
  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(enabled);
  // A filter or sort change keeps the cards on screen until the new ones arrive, so they can move
  // to their new places (#368): true while that runs
  const [updating, setUpdating] = useState(false);
  // Which list is on screen: `load` counts finished first-page loads, `page` the pages loaded
  const [batch, setBatch] = useState({ load: 0, page: 0 });
  const hasCards = useRef(false); // cards are on screen to swap from
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const request = useRef(0); // ignore responses from requests that were replaced

  const path = useCallback((n: number) => listingsPath(filters, n, pageSize, seller), [filters, pageSize, seller]);

  // quiet: refresh what's shown without the loading skeleton (after a purchase or a new listing).
  // swap: like quiet, but errors show and the list is marked as updating (a filter changed).
  const load = useCallback(
    async (mode: "show" | "swap" | "quiet") => {
      const id = ++request.current;
      const quiet = mode === "quiet";
      if (mode === "show") setLoading(true);
      setUpdating(mode === "swap");
      setError(null);
      setLoadMoreError(null);
      try {
        const result = await apiClient<ListingsPage>(path(1));
        if (id !== request.current) return;
        setListings(result.listings);
        setTotal(result.total);
        setPage(1);
        setBatch((b) => ({ load: b.load + 1, page: 1 }));
        hasCards.current = result.listings.length > 0;
      } catch (err) {
        if (id !== request.current) return;
        if (!quiet) {
          setError(err instanceof Error ? err.message : "Failed to fetch listings");
          hasCards.current = false;
        }
      } finally {
        if (id === request.current) {
          setLoading(false);
          setUpdating(false);
        }
      }
    },
    [path],
  );
  const reload = useCallback((quiet = false) => load(quiet ? "quiet" : "show"), [load]);

  const loadMore = useCallback(async () => {
    const id = request.current;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const result = await apiClient<ListingsPage>(path(page + 1));
      if (id !== request.current) return;
      setListings((current) => appendListings(current, result.listings));
      setTotal(result.total);
      setPage(page + 1);
      setBatch((b) => ({ ...b, page: page + 1 }));
    } catch (err) {
      if (id !== request.current) return;
      setLoadMoreError(err instanceof Error ? err.message : "Failed to fetch listings");
    } finally {
      setLoadingMore(false);
    }
  }, [path, page]);

  useEffect(() => {
    if (!enabled) {
      request.current++;
      hasCards.current = false;
      setListings([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    // Load the first page, and again whenever the filters change (keeping the cards on screen)
    void load(hasCards.current ? "swap" : "show");
  }, [load, enabled]);

  return { listings, total, loading, updating, batch, loadingMore, error, loadMoreError, hasMore: listings.length < total, reload, loadMore };
}
