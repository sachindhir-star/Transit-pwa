import { useEffect, useMemo, useState } from "react";
import { fetchLegEtas } from "../api/eta";
import { formatEtaLabel } from "../lib/formatEta";
import type { LiveEta, TripLeg } from "../types";

export type EtaStatus = "idle" | "loading" | "live" | "unavailable";

export function useLiveEta(leg: TripLeg | null, pollMs = 30000) {
  const [etas, setEtas] = useState<LiveEta[]>([]);
  const [status, setStatus] = useState<EtaStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leg?.eta) {
      setEtas([]);
      setStatus(leg?.trackingMode === "live-eta" ? "unavailable" : "idle");
      return;
    }
    let cancelled = false;
    const load = async () => {
      setStatus((s) => (s === "live" ? s : "loading"));
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

export interface LegEtaState {
  etas: LiveEta[];
  status: EtaStatus;
  error: string | null;
}

function legEtaKey(leg: TripLeg): string | null {
  if (!leg.eta) return null;
  const e = leg.eta;
  return `${e.operator}|${e.stopId}|${e.route}|${e.serviceType ?? ""}|${e.dir ?? ""}`;
}

/** Poll live ETAs for every bus leg that has an eta hook (locked multi-leg trips). */
export function useLiveEtasForLegs(legs: TripLeg[], pollMs = 30000): LegEtaState[] {
  const keys = useMemo(() => legs.map(legEtaKey), [legs]);
  const keySig = keys.join(";");
  const [states, setStates] = useState<LegEtaState[]>(() =>
    legs.map((leg) => ({
      etas: [],
      status: (leg.eta
        ? "loading"
        : leg.trackingMode === "live-eta"
          ? "unavailable"
          : "idle") as EtaStatus,
      error: null,
    })),
  );

  useEffect(() => {
    let cancelled = false;
    setStates(
      legs.map((leg) => ({
        etas: [],
        status: (leg.eta
          ? "loading"
          : leg.trackingMode === "live-eta"
            ? "unavailable"
            : "idle") as EtaStatus,
        error: null,
      })),
    );

    const load = async () => {
      const next = await Promise.all(
        legs.map(async (leg) => {
          if (!leg.eta) {
            return {
              etas: [] as LiveEta[],
              status: (leg.trackingMode === "live-eta" ? "unavailable" : "idle") as EtaStatus,
              error: null as string | null,
            };
          }
          const rows = await fetchLegEtas(leg.eta);
          if (!rows.length) {
            return {
              etas: [],
              status: "unavailable" as EtaStatus,
              error: "No ETA rows — feed empty or stop ID needs refresh",
            };
          }
          return { etas: rows, status: "live" as EtaStatus, error: null };
        }),
      );
      if (!cancelled) setStates(next);
    };

    load();
    const id = window.setInterval(load, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // keySig captures eta identity of each leg
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySig, pollMs]);

  return states;
}

export type BoardSnippet = {
  boardName: string;
  etaLabel: string | null;
  route?: string;
};

/** Slow-poll board ETA snippets for option list cards (cheap — top N only). */
export function useOptionBoardSnippets(
  options: { id: string; legs: TripLeg[] }[],
  opts: { limit?: number; pollMs?: number } = {},
): Record<string, BoardSnippet> {
  const limit = opts.limit ?? 6;
  const pollMs = opts.pollMs ?? 60_000;
  const targets = useMemo(() => {
    return options.slice(0, limit).map((o) => {
      const bus = o.legs.find((l) => l.eta && (l.mode === "CTB" || l.mode === "KMB"));
      return { id: o.id, bus: bus ?? null };
    });
  }, [options, limit]);

  const sig = targets.map((t) => `${t.id}:${t.bus ? legEtaKey(t.bus) : ""}`).join(";");
  const [map, setMap] = useState<Record<string, BoardSnippet>>({});

  useEffect(() => {
    let cancelled = false;
    const base: Record<string, BoardSnippet> = {};
    for (const t of targets) {
      if (!t.bus) continue;
      base[t.id] = {
        boardName: t.bus.fromStop.name,
        etaLabel: null,
        route: t.bus.route,
      };
    }
    setMap(base);

    const load = async () => {
      const entries = await Promise.all(
        targets.map(async (t) => {
          if (!t.bus?.eta) return null;
          const rows = await fetchLegEtas(t.bus.eta);
          const first = rows.find(
            (r) =>
              (r.etaIso && !Number.isNaN(Date.parse(r.etaIso))) ||
              (r.minutes != null && Number.isFinite(r.minutes)),
          );
          return {
            id: t.id,
            boardName: t.bus.fromStop.name,
            etaLabel: first
              ? formatEtaLabel({ etaIso: first.etaIso, minutes: first.minutes })
              : null,
            route: t.bus.route,
          };
        }),
      );
      if (cancelled) return;
      const next: Record<string, BoardSnippet> = { ...base };
      for (const e of entries) {
        if (e) next[e.id] = e;
      }
      setMap(next);
    };

    load();
    const id = window.setInterval(load, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, pollMs]);

  return map;
}
