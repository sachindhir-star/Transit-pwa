import { useCallback, useEffect, useRef, useState } from "react";
import {
  DBTSL_ETA_QUERIES,
  fetchDbtslAllDirections,
  type DbtslDirectionFeed,
  type DbtslRouteQuery,
  type DbtslStopEta,
} from "../api/dbtslEta";

const POLL_MS = 20_000;

function formatAgo(updatedAtMs: number | null, nowMs: number): string {
  if (updatedAtMs == null) return "";
  const sec = Math.max(0, Math.floor((nowMs - updatedAtMs) / 1000));
  if (sec < 3) return "Updated just now";
  if (sec < 60) return `Updated ${sec}s ago`;
  const min = Math.floor(sec / 60);
  return `Updated ${min}m ago`;
}

/** Poll eta.dbtsl.com stop ETAs for a DBTSL route number (~20s). */
export function useDbtslLive(routeNumber: string | null) {
  const queries: DbtslRouteQuery[] | undefined = routeNumber
    ? DBTSL_ETA_QUERIES[routeNumber]
    : undefined;
  /** Primary query (first destination) — used for shape / focused stop list. */
  const query = queries?.[0];
  const [stops, setStops] = useState<DbtslStopEta[] | null>(null);
  const [directions, setDirections] = useState<DbtslDirectionFeed[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [updatedAtMs, setUpdatedAtMs] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(() => Date.now());
  const gen = useRef(0);

  const load = useCallback(
    async (manual = false) => {
      if (!queries?.length) {
        setStops(null);
        setDirections(null);
        setError(null);
        setUpdatedAtMs(null);
        return;
      }
      const my = ++gen.current;
      if (manual) setRefreshing(true);
      try {
        const feeds = await fetchDbtslAllDirections(queries);
        if (my !== gen.current) return;
        setDirections(feeds);
        // Primary shape/list: first destination that returned stops, else first.
        const primary =
          feeds.find((f) => f.stops.length > 0) ?? feeds[0] ?? null;
        setStops(primary?.stops?.length ? primary.stops : []);
        setError(null);
        setUpdatedAtMs(Date.now());
      } catch (e) {
        if (my !== gen.current) return;
        console.warn("DBTSL ETA fetch failed", e);
        setError("ETA feed unavailable — showing seeded stop list");
      } finally {
        if (my === gen.current && manual) setRefreshing(false);
      }
    },
    [queries],
  );

  useEffect(() => {
    void load(false);
    if (!queries?.length) return;
    const id = window.setInterval(() => void load(false), POLL_MS);
    return () => {
      gen.current += 1;
      window.clearInterval(id);
    };
  }, [load, queries]);

  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const agoLabel = formatAgo(updatedAtMs, tick);

  return {
    query,
    queries,
    stops,
    directions,
    error,
    updatedAtMs,
    agoLabel,
    refreshing,
    refresh: () => void load(true),
  };
}
