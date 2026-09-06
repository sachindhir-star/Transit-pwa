import { fetchJson } from "./client";
import { formatEtaLabel } from "../lib/formatEta";
import type { InferredBus, StopPoint } from "../types";

/** Official DBTSL ETA site used inside the Discovery Bay app WebView. CORS is open. */
const ETA_BASE = "https://eta.dbtsl.com/api/v0";

export interface DbtslRouteQuery {
  route: string;
  destination: string;
  variant: string;
  language?: string;
}

export interface DbtslStopEta {
  stop: string;
  info: string[];
  time: string[];
  trip_code: string[];
  latitude: number;
  longitude: number;
  people_cnt: number;
}

interface DbtslStopsResponse {
  status: string;
  stops: DbtslStopEta[];
}

/** Known queries for routes we surface on the DB buses tab. */
export const DBTSL_ETA_QUERIES: Record<string, DbtslRouteQuery> = {
  C4: { route: "C4", destination: "DB Circle", variant: "1) Normal Route" },
  C9: { route: "C9", destination: "DB Circle", variant: "1) Normal Route" },
  "1": { route: "1", destination: "Headland Drive Circular", variant: "1) Normal Route" },
  "2": { route: "2", destination: "Midvale Village Circular", variant: "1) Normal Route" },
  "3": { route: "3", destination: "Parkvale Village Circular", variant: "1) Normal Route" },
  "5": { route: "5", destination: "La Serene Circular", variant: "1) Normal Route" },
  "6": { route: "6", destination: "Seabee Lane Circular", variant: "1) Normal Route" },
  "15": { route: "15", destination: "DB Plaza", variant: "1) Normal Route" },
  "18": { route: "18", destination: "DB Plaza", variant: "1) Normal Route" },
};

function minutesUntil(iso: string): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / 60000);
}

/** trip_code like 2026-09-06_VR7581_C4_DB Circle_1) Normal Route_1620 */
export function parseTripCode(tripCode: string): { plate: string; route: string } {
  const parts = tripCode.split("_");
  return {
    plate: parts[1] || "bus",
    route: parts[2] || "",
  };
}

export async function fetchDbtslBusStops(
  query: DbtslRouteQuery,
): Promise<DbtslStopEta[]> {
  const params = new URLSearchParams({
    route: query.route,
    destination: query.destination,
    variant: query.variant,
    language: query.language ?? "en-US",
  });
  const data = await fetchJson<DbtslStopsResponse[]>(
    `${ETA_BASE}/get_bus_stops?${params}`,
  );
  const row = data?.[0];
  if (!row || row.status !== "success") return [];
  return row.stops ?? [];
}

/**
 * Place one ETA-inferred marker per active trip at the next stop that still
 * has a future arrival. Stop lat/lng come from the operator feed — never GPS
 * of the vehicle itself (no vehicle-position endpoint exists).
 */
export function inferDbtslBusesFromStops(stops: DbtslStopEta[]): InferredBus[] {
  const byTrip = new Map<
    string,
    { stop: DbtslStopEta; etaIso: string; minutes: number }
  >();

  for (const stop of stops) {
    for (let i = 0; i < stop.trip_code.length; i++) {
      const trip = stop.trip_code[i];
      const etaIso = stop.time[i];
      if (!trip || !etaIso) continue;
      const minutes = minutesUntil(etaIso);
      if (minutes == null || minutes < -2) continue;
      const prev = byTrip.get(trip);
      if (!prev || minutes < prev.minutes) {
        byTrip.set(trip, { stop, etaIso, minutes: Math.max(0, minutes) });
      }
    }
  }

  const buses: InferredBus[] = [];
  for (const [trip, hit] of byTrip) {
    const { plate } = parseTripCode(trip);
    buses.push({
      id: `dbtsl-${trip}`,
      lat: hit.stop.latitude,
      lng: hit.stop.longitude,
      etaMinutes: hit.minutes,
      label: `${plate} · ${formatEtaLabel({ etaIso: hit.etaIso, minutes: hit.minutes }) ?? `${hit.minutes} mins`} → ${hit.stop.stop} · ETA-inferred (not GPS)`,
      mode: "eta-inferred",
    });
  }
  return buses;
}

export function dbtslStopsToPoints(stops: DbtslStopEta[]): StopPoint[] {
  return stops.map((s, i) => ({
    id: `dbtsl-stop-${i}`,
    name: s.stop,
    lat: s.latitude,
    lng: s.longitude,
  }));
}
