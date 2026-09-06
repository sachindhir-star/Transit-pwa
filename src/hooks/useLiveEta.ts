import { useEffect, useState } from "react";
import { fetchLegEtas } from "../api/eta";
import type { LiveEta, TripLeg } from "../types";

export function useLiveEta(leg: TripLeg | null, pollMs = 30000) {
  const [etas, setEtas] = useState<LiveEta[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "live" | "unavailable">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leg?.eta) {
      setEtas([]);
      setStatus(leg?.trackingMode === "live-eta" ? "unavailable" : "idle");
      return;
    }
    let cancelled = false;
    const load = async () => {
      setStatus("loading");
      setError(null);
      const rows = await fetchLegEtas(leg.eta!);
      if (cancelled) return;
      if (!rows.length) {
        setEtas([]);
        setStatus("unavailable");
        setError("No ETA rows — feed empty or stop ID needs refresh");
      } else {
        setEtas(rows);
        setStatus("live");
      }
    };
    load();
    const id = window.setInterval(load, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [leg, pollMs]);

  return { etas, status, error };
}
