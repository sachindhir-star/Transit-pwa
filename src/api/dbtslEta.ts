import { fetchJson } from "./client";
import type { LatLng } from "./roadGeometry";
import {
  circularLegLabel,
  isCircularDbDest,
} from "../lib/circularLeg";
import { formatEtaLabel } from "../lib/formatEta";
import { placeApproachingStopByIndex } from "../lib/placeAlong";
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

/** One destination/variant poll result for a resident-facing route chip. */
export interface DbtslDirectionFeed {
  query: DbtslRouteQuery;
  /** Short label for status copy (e.g. "Tung Chung", "Plaza"). */
  destLabel: string;
  stops: DbtslStopEta[];
}

interface DbtslStopsResponse {
  status: string;
  stops: DbtslStopEta[];
}

/**
 * Keys match DbBusRoute.number (resident-facing labels).
 * `route` is the eta.dbtsl.com code (01R, 02R, 6, C4, …).
 * Multiple entries = every destination/variant from get_bus_routes that we poll
 * and merge onto the map (bidirectional external routes, 15/18, etc.).
 */
export const DBTSL_ETA_QUERIES: Record<string, DbtslRouteQuery[]> = {
  C4: [{ route: "C4", destination: "DB Circle", variant: "1) Normal Route" }],
  C9: [{ route: "C9", destination: "DB Circle", variant: "1) Normal Route" }],
  "1": [
    {
      route: "1",
      destination: "Headland Drive Circular",
      variant: "1) Normal Route",
    },
  ],
  "2": [
    {
      route: "2",
      destination: "Midvale Village Circular",
      variant: "1) Normal Route",
    },
  ],
  "3": [
    {
      route: "3",
      destination: "Parkvale Village Circular",
      variant: "1) Normal Route",
    },
  ],
  "5": [
    { route: "5", destination: "La Serene Circular", variant: "1) Normal Route" },
  ],
  "6": [
    {
      route: "6",
      destination: "Seabee Lane Circular",
      variant: "1) Normal Route",
    },
  ],
  "15": [
    { route: "15", destination: "DB Plaza", variant: "1) Normal Route" },
    { route: "15", destination: "Chianti", variant: "1) Normal Route" },
  ],
  "18": [
    { route: "18", destination: "IL PICCO", variant: "1) Normal Route" },
    { route: "18", destination: "DB Plaza", variant: "1) Normal Route" },
  ],
  DB01R: [
    { route: "01R", destination: "Tung Chung Station", variant: "1 Normal Route" },
    { route: "01R", destination: "DB Plaza", variant: "1 Normal Route" },
  ],
  DB01A: [
    { route: "01A", destination: "Tung Chung Station", variant: "1) Normal Route" },
    { route: "01A", destination: "DB North Plaza", variant: "1) Normal Route" },
  ],
  DB01P: [
    {
      route: "01P",
      destination: "Tung Chung Station",
      variant: "1 from Club Siena Opp",
    },
  ],
  DB02R: [
    { route: "02R", destination: "Airport Circular", variant: "1) Normal Route" },
    {
      route: "02R",
      destination: "Airport Circular",
      variant: "2) Additional Stop at Cathay City",
    },
  ],
  DB02A: [
    { route: "02A", destination: "Airport Circular", variant: "1) Normal Route" },
    { route: "02A", destination: "Airport Circular", variant: "2) via HZMB" },
  ],
  DB03R: [
    { route: "03R", destination: "Sunny Bay Station", variant: "1 Normal Route" },
    { route: "03R", destination: "DB Plaza", variant: "1 Normal Route" },
  ],
  DB03P: [
    { route: "03P", destination: "Sunny Bay Station", variant: "1) Normal Route" },
    { route: "03P", destination: "DB North Plaza", variant: "1) Normal Route" },
  ],
  DB08R: [
    { route: "N08R", destination: "Central", variant: "1) Normal Route" },
    { route: "N08R", destination: "Coastline Villa", variant: "1) Normal Route" },
  ],
};

/** Compact destination label for status banners. */
export function shortDestLabel(destination: string): string {
  const d = destination.trim();
  if (/tung chung/i.test(d)) return "Tung Chung";
  if (/sunny bay/i.test(d)) return "Sunny Bay";
  if (/north plaza/i.test(d)) return "North Plaza";
  if (/db plaza|discovery bay plaza/i.test(d)) return "Plaza";
  if (/airport/i.test(d)) return "Airport";
  if (/central/i.test(d)) return "Central";
  if (/chianti/i.test(d)) return "Chianti";
  if (/il picco/i.test(d)) return "IL PICCO";
  if (/coastline/i.test(d)) return "Coastline";
  if (/db circle/i.test(d)) return "DB Circle";
  return d.replace(/\s*circular.*/i, "").trim() || d;
}

/**
 * Status fragment like "2 active · 1 toward Tung Chung, 1 toward Plaza".
 * Counts unique trip markers by destination label.
 */
export function formatActiveTripsStatus(
  buses: Array<{ destinationLabel?: string }>,
): string {
  const n = buses.length;
  if (n === 0) return "0 active trips";
  const byDest = new Map<string, number>();
  for (const b of buses) {
    const key = b.destinationLabel || "route";
    byDest.set(key, (byDest.get(key) ?? 0) + 1);
  }
  const parts = [...byDest.entries()].map(([dest, count]) => {
    if (byDest.size === 1 && /circle/i.test(dest)) {
      return null; // circular: skip redundant "toward DB Circle"
    }
    return `${count} toward ${dest}`;
  });
  const detail = parts.filter(Boolean).join(", ");
  const head = `${n} active trip${n === 1 ? "" : "s"}`;
  return detail ? `${head} · ${detail}` : head;
}

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

/** Poll every destination/variant for a route chip and return tagged feeds. */
export async function fetchDbtslAllDirections(
  queries: DbtslRouteQuery[],
): Promise<DbtslDirectionFeed[]> {
  const results = await Promise.all(
    queries.map(async (query) => {
      const stops = await fetchDbtslBusStops(query);
      return {
        query,
        destLabel: shortDestLabel(query.destination),
        stops,
      } satisfies DbtslDirectionFeed;
    }),
  );
  return results;
}

export interface TripHit {
  stopIndex: number;
  stop: DbtslStopEta;
  etaIso: string;
  minutes: number;
}

/**
 * Per active trip: next stop with the soonest ETA still within the live window.
 * Keeps ETAs in (-2, 0] (due / just-due) — only drops older than 2 minutes past.
 * Prefer lower stop index when minute values tie so we never skip a due stop.
 */
export function nextStopsByTrip(stops: DbtslStopEta[]): Map<string, TripHit> {
  const byTrip = new Map<string, TripHit>();
  for (let si = 0; si < stops.length; si++) {
    const stop = stops[si];
    for (let i = 0; i < stop.trip_code.length; i++) {
      const trip = stop.trip_code[i];
      const etaIso = stop.time[i];
      if (!trip || !etaIso) continue;
      const minutes = minutesUntil(etaIso);
      // Retain due / slightly-late ETAs; drop only when clearly stale.
      if (minutes == null || minutes < -2) continue;
      const prev = byTrip.get(trip);
      const mins = Math.max(0, minutes);
      if (
        !prev ||
        mins < prev.minutes ||
        (mins === prev.minutes && si < prev.stopIndex)
      ) {
        byTrip.set(trip, { stopIndex: si, stop, etaIso, minutes: mins });
      }
    }
  }
  return byTrip;
}

/** Resolve live destinationLabel — circular C4/C9 use active-leg landmark. */
export function resolveLiveDestinationLabel(
  stops: DbtslStopEta[],
  tripCode: string,
  nextStopIndex: number,
  apiDestLabel?: string,
): string | undefined {
  const { route } = parseTripCode(tripCode);
  const routeNum = (route || "").toUpperCase();
  const circular =
    routeNum === "C4" ||
    routeNum === "C9" ||
    isCircularDbDest(apiDestLabel);
  if (circular) {
    const leg = circularLegLabel(routeNum || "C4", stops, nextStopIndex);
    if (leg) return leg;
    // Never surface useless "DB Circle" on live markers.
    if (isCircularDbDest(apiDestLabel)) return undefined;
  }
  return apiDestLabel;
}

/**
 * Place one ETA-inferred marker per active trip at the next stop that still
 * has a future arrival. Stop lat/lng come from the operator feed — never GPS
 * of the vehicle itself (no vehicle-position endpoint exists).
 */
export function inferDbtslBusesFromStops(
  stops: DbtslStopEta[],
  opts?: { destinationLabel?: string },
): InferredBus[] {
  const byTrip = nextStopsByTrip(stops);
  const buses: InferredBus[] = [];
  for (const [trip, hit] of byTrip) {
    const { plate } = parseTripCode(trip);
    const dest = resolveLiveDestinationLabel(
      stops,
      trip,
      hit.stopIndex,
      opts?.destinationLabel,
    );
    const destBit = dest ? ` · → ${dest}` : "";
    buses.push({
      id: `dbtsl-${trip}`,
      lat: hit.stop.latitude,
      lng: hit.stop.longitude,
      etaMinutes: hit.minutes,
      plate,
      label: `${plate} · ${formatEtaLabel({ etaIso: hit.etaIso, minutes: hit.minutes }) ?? `${hit.minutes} mins`} → ${hit.stop.stop}${destBit} · Estimated from next-stop ETA — not live GPS`,
      mode: "eta-inferred",
      nextStopName: hit.stop.stop,
      destinationLabel: dest,
    });
  }
  return buses;
}

/**
 * Same ETA next-stop inference, but place the icon on the road-following
 * polyline slightly upstream of the next stop, with heading toward it.
 */
export function inferDbtslBusesOnRoad(
  stops: DbtslStopEta[],
  road: LatLng[],
  opts?: { destinationLabel?: string },
): InferredBus[] {
  const byTrip = nextStopsByTrip(stops);
  const buses: InferredBus[] = [];
  // Build once: monotonic along-distances so loop routes (C9 Plaza×2) place
  // on the active leg — never snap geographic-nearest to an earlier Plaza pass.
  const stopLatLngs = stops.map((s) => ({
    lat: s.latitude,
    lng: s.longitude,
  }));
  for (const [trip, hit] of byTrip) {
    const { plate } = parseTripCode(trip);
    const dest = resolveLiveDestinationLabel(
      stops,
      trip,
      hit.stopIndex,
      opts?.destinationLabel,
    );
    const next = { lat: hit.stop.latitude, lng: hit.stop.longitude };
    const placed =
      road.length >= 2
        ? placeApproachingStopByIndex(
            road,
            stopLatLngs,
            hit.stopIndex,
            hit.minutes,
          )
        : null;
    const lat = placed?.lat ?? next.lat;
    const lng = placed?.lng ?? next.lng;
    const heading = placed?.heading;
    const destBit = dest ? ` · → ${dest}` : "";
    buses.push({
      id: `dbtsl-${trip}`,
      lat,
      lng,
      etaMinutes: hit.minutes,
      plate,
      label: `${plate} · ${formatEtaLabel({ etaIso: hit.etaIso, minutes: hit.minutes }) ?? `${hit.minutes} mins`} → ${hit.stop.stop}${destBit} · Estimated from next-stop ETA — not live GPS`,
      mode: "eta-inferred",
      heading,
      nextStopName: hit.stop.stop,
      destinationLabel: dest,
    });
  }
  return buses;
}

/**
 * Merge active trips from every direction/variant feed onto one bus list.
 * Uses each feed's own stop sequence for placement (stop chords as road path
 * when a shared OSRM line is not available for that direction).
 */
export function inferDbtslBusesAllDirections(
  directions: DbtslDirectionFeed[],
  primaryRoad?: LatLng[],
): InferredBus[] {
  const out: InferredBus[] = [];
  const seen = new Set<string>();
  directions.forEach((dir, di) => {
    if (!dir.stops.length) return;
    const road: LatLng[] =
      di === 0 && primaryRoad && primaryRoad.length >= 2
        ? primaryRoad
        : dir.stops.map((s) => ({ lat: s.latitude, lng: s.longitude }));
    const buses = inferDbtslBusesOnRoad(dir.stops, road, {
      destinationLabel: dir.destLabel,
    });
    for (const b of buses) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      out.push(b);
    }
  });
  return out;
}

export function dbtslStopsToPoints(stops: DbtslStopEta[]): StopPoint[] {
  return stops.map((s, i) => ({
    id: `dbtsl-stop-${i}`,
    name: s.stop,
    lat: s.latitude,
    lng: s.longitude,
  }));
}
