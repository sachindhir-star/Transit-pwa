import type { DbtslStopEta } from "../api/dbtslEta";
import { parseTripCode } from "../api/dbtslEta";
import { formatEtaLabel } from "./formatEta";
import { bearingDeg, distM } from "./placeAlong";
import type { InferredBus, StopPoint } from "../types";

const WALK_M_PER_MIN = 80; // ~4.8 km/h

export interface TripUpcomingStop {
  stopIndex: number;
  name: string;
  lat: number;
  lng: number;
  etaIso: string | null;
  minutes: number | null;
  tripCode: string;
}

export interface TripFocus {
  tripCode: string;
  plate: string;
  /** Index of next upcoming stop for this trip */
  nextStopIndex: number;
  upcoming: TripUpcomingStop[];
}

function minutesUntil(iso: string): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / 60000);
}

/** All future hits for a trip, ordered by stop index then time. */
export function upcomingForTrip(
  stops: DbtslStopEta[],
  tripCode: string,
): TripUpcomingStop[] {
  const out: TripUpcomingStop[] = [];
  for (let si = 0; si < stops.length; si++) {
    const stop = stops[si];
    for (let i = 0; i < stop.trip_code.length; i++) {
      if (stop.trip_code[i] !== tripCode) continue;
      const etaIso = stop.time[i] ?? null;
      if (!etaIso) continue;
      const minutes = minutesUntil(etaIso);
      if (minutes == null || minutes < -2) continue;
      out.push({
        stopIndex: si,
        name: stop.stop,
        lat: stop.latitude,
        lng: stop.longitude,
        etaIso,
        minutes: Math.max(0, minutes),
        tripCode,
      });
    }
  }
  out.sort((a, b) => a.stopIndex - b.stopIndex || (a.minutes ?? 0) - (b.minutes ?? 0));
  return out;
}

/** Every active trip with its upcoming stop list. */
export function listActiveTrips(stops: DbtslStopEta[]): TripFocus[] {
  const codes = new Set<string>();
  for (const stop of stops) {
    for (const tc of stop.trip_code) {
      if (tc) codes.add(tc);
    }
  }
  const trips: TripFocus[] = [];
  for (const tripCode of codes) {
    const upcoming = upcomingForTrip(stops, tripCode);
    if (!upcoming.length) continue;
    const { plate } = parseTripCode(tripCode);
    trips.push({
      tripCode,
      plate,
      nextStopIndex: upcoming[0].stopIndex,
      upcoming,
    });
  }
  // Soonest next ETA first (default active)
  trips.sort(
    (a, b) =>
      (a.upcoming[0]?.minutes ?? 999) - (b.upcoming[0]?.minutes ?? 999) ||
      a.nextStopIndex - b.nextStopIndex,
  );
  return trips;
}

/** Compass-ish label from heading degrees. */
export function headingLabel(deg: number | null | undefined): string | null {
  if (deg == null || !Number.isFinite(deg)) return null;
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[i];
}

/**
 * SD heuristic: if you are near one end of a DB route, you are going to the other end.
 * Returns the stop index we treat as the "destination hub" (far end / major hub away from user).
 */
export function inferDestinationEndIndex(
  stops: Array<{ lat: number; lng: number; name: string }>,
  nearestIndex: number,
): number {
  if (stops.length < 2) return Math.max(0, stops.length - 1);
  const n = stops.length;
  const nearest = stops[nearestIndex];

  // Score each stop as a candidate "other end": far from user + near route termini
  // Prefer termini (first/last ~15% of route) and major hubs by name.
  const hubRe =
    /plaza|pier|ferry|terminus|tung chung|airport|sunny bay|north plaza|coastline|crestmont|seabee|headland|il picco/i;

  let bestI = nearestIndex === 0 ? n - 1 : 0;
  let bestScore = -Infinity;
  for (let i = 0; i < n; i++) {
    if (i === nearestIndex) continue;
    const dist = distM(nearest, stops[i]);
    const endBias =
      i <= Math.max(1, Math.floor(n * 0.12)) || i >= n - 1 - Math.max(1, Math.floor(n * 0.12))
        ? 1.35
        : 1;
    const hubBias = hubRe.test(stops[i].name) ? 1.25 : 1;
    // Prefer opposite side of the ordered list from the user
    const span = Math.abs(i - nearestIndex) / Math.max(1, n - 1);
    const oppositeBias = 0.75 + span;
    const score = dist * endBias * hubBias * oppositeBias;
    if (score > bestScore) {
      bestScore = score;
      bestI = i;
    }
  }
  return bestI;
}

/**
 * Prefer the trip whose upcoming stops progress toward the destination end.
 * Fallback: soonest ETA trip.
 */
export function pickTripTowardDestination(
  trips: TripFocus[],
  destIndex: number,
  nearestIndex: number,
): TripFocus | null {
  if (!trips.length) return null;
  const scored = trips.map((t) => {
    const next = t.nextStopIndex;
    // Progress toward dest: next stop is between user and dest (or beyond nearest toward dest)
    const toward =
      destIndex >= nearestIndex
        ? next >= nearestIndex && next <= destIndex + 2
        : next <= nearestIndex && next >= destIndex - 2;
    const lastUp = t.upcoming[t.upcoming.length - 1]?.stopIndex ?? next;
    const coversDest =
      destIndex >= nearestIndex
        ? lastUp >= destIndex - 1
        : lastUp <= destIndex + 1 || lastUp < next; // circular wrap hard; still prefer toward
    const eta = t.upcoming[0]?.minutes ?? 999;
    let score = 0;
    if (toward) score += 50;
    if (coversDest) score += 20;
    // Closer next stop to user (in index space) is nicer
    score -= Math.min(30, Math.abs(next - nearestIndex));
    score -= Math.min(25, eta); // sooner is better
    return { t, score };
  });
  scored.sort((a, b) => b.score - a.score || (a.t.upcoming[0]?.minutes ?? 0) - (b.t.upcoming[0]?.minutes ?? 0));
  return scored[0]?.t ?? trips[0];
}

export interface LocationSuggestion {
  nearestStopIndex: number;
  nearestStopName: string;
  nearestLat: number;
  nearestLng: number;
  walkMeters: number;
  walkMins: number | null;
  destStopIndex: number;
  destStopName: string;
  trip: TripFocus | null;
  /** ETA at nearest stop for the preferred trip (or any trip if missing). */
  etaAtNearest: string | null;
  busHeadingLabel: string | null;
  busNextStopName: string | null;
  summaryLine: string;
}

function etaForStopOnTrip(
  stop: DbtslStopEta | undefined,
  tripCode: string | null,
): { etaIso: string; minutes: number } | null {
  if (!stop) return null;
  if (tripCode) {
    for (let i = 0; i < stop.trip_code.length; i++) {
      if (stop.trip_code[i] !== tripCode) continue;
      const etaIso = stop.time[i];
      if (!etaIso) continue;
      const minutes = minutesUntil(etaIso);
      if (minutes == null || minutes < -2) continue;
      return { etaIso, minutes: Math.max(0, minutes) };
    }
  }
  // Fallback: soonest future ETA at this stop
  let best: { etaIso: string; minutes: number } | null = null;
  for (let i = 0; i < stop.time.length; i++) {
    const etaIso = stop.time[i];
    if (!etaIso) continue;
    const minutes = minutesUntil(etaIso);
    if (minutes == null || minutes < -2) continue;
    const m = Math.max(0, minutes);
    if (!best || m < best.minutes) best = { etaIso, minutes: m };
  }
  return best;
}

/**
 * Build "Near X → suggested toward Y" suggestion from user GPS + route stops + trips.
 */
export function buildLocationSuggestion(opts: {
  user: { lat: number; lng: number };
  shapeStops: StopPoint[];
  liveStops: DbtslStopEta[] | null;
  buses: InferredBus[];
  trips: TripFocus[];
}): LocationSuggestion | null {
  const { user, shapeStops, liveStops, buses, trips } = opts;
  if (!shapeStops.length) return null;

  let nearestStopIndex = 0;
  let bestD = Infinity;
  for (let i = 0; i < shapeStops.length; i++) {
    const d = distM(user, shapeStops[i]);
    if (d < bestD) {
      bestD = d;
      nearestStopIndex = i;
    }
  }
  const nearest = shapeStops[nearestStopIndex];
  const destStopIndex = inferDestinationEndIndex(shapeStops, nearestStopIndex);
  const dest = shapeStops[destStopIndex];
  const trip = pickTripTowardDestination(trips, destStopIndex, nearestStopIndex);

  const liveNearest = liveStops?.[nearestStopIndex];
  const etaHit = etaForStopOnTrip(liveNearest, trip?.tripCode ?? null);
  // If preferred trip already passed this stop, use trip's next upcoming ETA for context
  let etaLabel =
    etaHit != null
      ? formatEtaLabel({ etaIso: etaHit.etaIso, minutes: etaHit.minutes })
      : null;
  if (!etaLabel && trip?.upcoming[0]) {
    const u = trip.upcoming[0];
    etaLabel = formatEtaLabel({ etaIso: u.etaIso, minutes: u.minutes });
  }

  const matchingBus =
    trip != null
      ? buses.find((b) => b.id === `dbtsl-${trip.tripCode}`) ?? null
      : buses[0] ?? null;
  const busHeading =
    matchingBus?.nextStopName
      ? `toward ${matchingBus.nextStopName}`
      : headingLabel(matchingBus?.heading) != null
        ? `${headingLabel(matchingBus?.heading)}`
        : null;

  const walkMeters = Math.round(bestD);
  const walkMins =
    walkMeters < 30 ? 0 : Math.max(1, Math.round(walkMeters / WALK_M_PER_MIN));

  const shortNear = nearest.name.replace(/\s*\([^)]*\)\s*$/, "");
  const shortDest = dest.name.replace(/\s*\([^)]*\)\s*$/, "");

  return {
    nearestStopIndex,
    nearestStopName: nearest.name,
    nearestLat: nearest.lat,
    nearestLng: nearest.lng,
    walkMeters,
    walkMins,
    destStopIndex,
    destStopName: dest.name,
    trip,
    etaAtNearest: etaLabel,
    busHeadingLabel: busHeading,
    busNextStopName: matchingBus?.nextStopName ?? trip?.upcoming[0]?.name ?? null,
    summaryLine: `Near ${shortNear} → suggested toward ${shortDest}`,
  };
}

/** Bearing hint between two points for copy. */
export function towardBearingLabel(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): string {
  return headingLabel(bearingDeg(from, to)) ?? "";
}
