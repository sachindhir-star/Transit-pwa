import { useCallback, useEffect, useRef, useState } from "react";
import {
  DBTSL_ETA_QUERIES,
  fetchDbtslBusStops,
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
  const query = routeNumber ? DBTSL_ETA_QUERIES[routeNumber] : undefined;
  const [stops, setStops] = useState<DbtslStopEta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAtMs, setUpdatedAtMs] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(() => Date.now());
  const gen = useRef(0);

  const load = useCallback(
    async (manual = false) => {
      if (!query) {
        setStops(null);
        setError(null);
        setUpdatedAtMs(null);
        return;
      }
      const my = ++gen.current;
      if (manual) setRefreshing(true);
      try {
        const rows = await fetchDbtslBusStops(query);
        if (my !== gen.current) return;
        setStops(rows);
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
    [query],
  );

  useEffect(() => {
    void load(false);
    if (!query) return;
    const id = window.setInterval(() => void load(false), POLL_MS);
    return () => {
      gen.current += 1;
      window.clearInterval(id);
    };
  }, [load, query]);

  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const agoLabel = formatAgo(updatedAtMs, tick);

  return {
    query,
    stops,
    error,
    updatedAtMs,
    agoLabel,
    refreshing,
    refresh: () => void load(true),
  };
}
