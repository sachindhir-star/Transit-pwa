import type { DbtslStopEta } from "../api/dbtslEta";
import { parseTripCode } from "../api/dbtslEta";
import { formatEtaLabel } from "./formatEta";
import { listActiveTrips, type TripFocus } from "./dbSuggest";

/** Stable glanceable landmarks for the C4/C9 column board (top → bottom). */
export type LandmarkId = "start" | "plaza" | "north";

export interface LandmarkDef {
  id: LandmarkId;
  /** Short label shown on the board */
  label: string;
  /** Fuzzy match against eta.dbtsl.com stop names */
  match: RegExp;
}

export interface RouteBoardDef {
  route: "C4" | "C9";
  title: string;
  emptyLabel: string;
  landmarks: LandmarkDef[];
}

export const C4_BOARD: RouteBoardDef = {
  route: "C4",
  title: "C4",
  emptyLabel: "No active C4 trips right now",
  landmarks: [
    {
      id: "start",
      label: "Coastline",
      match: /coastline/i,
    },
    {
      id: "plaza",
      label: "Main Plaza",
      match: /plaza\s*(bus\s*)?terminus|db\s*plaza|plaza\s*terminus/i,
    },
    {
      id: "north",
      label: "North Plaza",
      match: /north\s*plaza|db\s*north/i,
    },
  ],
};

export const C9_BOARD: RouteBoardDef = {
  route: "C9",
  title: "C9",
  emptyLabel: "No active C9 trips right now",
  landmarks: [
    {
      id: "start",
      label: "Crestmont",
      match: /crestmont|caperidge|capeland/i,
    },
    {
      id: "plaza",
      label: "Main Plaza",
      match: /plaza\s*(bus\s*)?terminus|db\s*plaza|plaza\s*terminus/i,
    },
    {
      id: "north",
      label: "North Plaza",
      match: /north\s*plaza|db\s*north/i,
    },
  ],
};

export interface LandmarkHit {
  id: LandmarkId;
  label: string;
  /** Index into the live stop list (first outbound match). */
  stopIndex: number;
  feedName: string;
}

export interface LandmarkEta {
  id: LandmarkId;
  label: string;
  feedName: string | null;
  stopIndex: number | null;
  etaIso: string | null;
  minutes: number | null;
  etaLabel: string | null;
  /** Bus already passed this landmark on the outbound leg. */
  passed: boolean;
}

export interface BusColumnModel {
  tripCode: string;
  plate: string;
  landmarks: LandmarkEta[];
  /**
   * 0 = at first landmark, 1 = at last.
   * Derived from next-stop index + ETAs (ETA-inferred, not GPS).
   */
  progress: number;
  nextLandmarkId: LandmarkId | null;
}

function minutesUntil(iso: string): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / 60000);
}

function etaForTripAtStop(
  stop: DbtslStopEta | undefined,
  tripCode: string,
): { etaIso: string; minutes: number } | null {
  if (!stop) return null;
  for (let i = 0; i < stop.trip_code.length; i++) {
    if (stop.trip_code[i] !== tripCode) continue;
    const etaIso = stop.time[i];
    if (!etaIso) continue;
    const minutes = minutesUntil(etaIso);
    if (minutes == null || minutes < -2) continue;
    return { etaIso, minutes: Math.max(0, minutes) };
  }
  return null;
}

/**
 * Map feed stops → the 3 fixed landmarks in order (first outbound hit each).
 * Plaza / North must appear after the previous landmark's stop index.
 */
export function resolveLandmarks(
  stops: DbtslStopEta[],
  def: RouteBoardDef,
): LandmarkHit[] {
  const hits: LandmarkHit[] = [];
  let from = 0;
  for (const lm of def.landmarks) {
    let found: LandmarkHit | null = null;
    for (let i = from; i < stops.length; i++) {
      const name = stops[i]?.stop ?? "";
      if (!lm.match.test(name)) continue;
      // Main Plaza must not steal "DB North Plaza".
      if (lm.id === "plaza" && /north/i.test(name)) continue;
      found = {
        id: lm.id,
        label: lm.label,
        stopIndex: i,
        feedName: name,
      };
      break;
    }
    if (found) {
      hits.push(found);
      from = found.stopIndex + 1;
    }
  }
  return hits;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Place the bus along the fixed landmark column.
 * Honesty: uses stop sequence + ETAs only (same idea as the map).
 */
export function inferColumnProgress(
  trip: TripFocus,
  landmarks: LandmarkHit[],
  stops: DbtslStopEta[],
): { progress: number; nextLandmarkId: LandmarkId | null } {
  if (landmarks.length < 2) {
    return { progress: 0, nextLandmarkId: landmarks[0]?.id ?? null };
  }

  const nextIdx = trip.nextStopIndex;
  const last = landmarks[landmarks.length - 1];

  // Past final landmark (return leg) → sit at the bottom.
  if (nextIdx > last.stopIndex) {
    return { progress: 1, nextLandmarkId: null };
  }

  // Find the next landmark at/after the bus's next stop.
  let nextLm = landmarks.findIndex((lm) => lm.stopIndex >= nextIdx);
  if (nextLm < 0) nextLm = landmarks.length - 1;

  if (nextLm === 0) {
    // Approaching (or at) the first landmark — keep near the top.
    const hit = etaForTripAtStop(stops[landmarks[0].stopIndex], trip.tripCode);
    const pull = hit ? Math.min(0.12, hit.minutes / 40) : 0.04;
    return {
      progress: clamp01(0.08 - pull * 0.3),
      nextLandmarkId: landmarks[0].id,
    };
  }

  const prev = landmarks[nextLm - 1];
  const next = landmarks[nextLm];
  const span = Math.max(1, next.stopIndex - prev.stopIndex);
  // How far the next stop has advanced into this segment.
  let frac = (nextIdx - prev.stopIndex) / span;

  // Soften with ETA minutes to the next landmark when available.
  const etaNext = etaForTripAtStop(stops[next.stopIndex], trip.tripCode);
  const etaPrev = etaForTripAtStop(stops[prev.stopIndex], trip.tripCode);
  if (etaNext && etaPrev && etaNext.minutes > etaPrev.minutes) {
    const segMins = Math.max(1, etaNext.minutes - etaPrev.minutes);
    const remaining = Math.max(0, etaNext.minutes - (trip.upcoming[0]?.minutes ?? etaNext.minutes));
    // Prefer index-based frac, blend a little with time remaining in segment.
    const timeFrac = 1 - remaining / segMins;
    frac = 0.65 * frac + 0.35 * clamp01(timeFrac);
  } else if (etaNext) {
    // Pull slightly back from the next landmark when ETA is still a few minutes out.
    const pull = Math.min(0.35, etaNext.minutes / 25);
    frac = Math.min(frac, 1 - pull);
  }

  // Don't sit exactly on a landmark unless next stop IS that landmark.
  if (nextIdx < next.stopIndex) {
    frac = Math.min(frac, 0.92);
  } else {
    frac = 1;
  }

  const progress =
    (nextLm - 1 + clamp01(frac)) / Math.max(1, landmarks.length - 1);
  return {
    progress: clamp01(progress),
    nextLandmarkId: next.id,
  };
}

export function buildBusColumns(
  stops: DbtslStopEta[] | null | undefined,
  def: RouteBoardDef,
): BusColumnModel[] {
  if (!stops?.length) return [];
  const landmarks = resolveLandmarks(stops, def);
  if (!landmarks.length) return [];

  const trips = listActiveTrips(stops);
  return trips.map((trip) => {
    const { plate } = parseTripCode(trip.tripCode);
    const { progress, nextLandmarkId } = inferColumnProgress(
      trip,
      landmarks,
      stops,
    );

    const landmarkEtas: LandmarkEta[] = def.landmarks.map((lmDef) => {
      const hit = landmarks.find((h) => h.id === lmDef.id) ?? null;
      if (!hit) {
        return {
          id: lmDef.id,
          label: lmDef.label,
          feedName: null,
          stopIndex: null,
          etaIso: null,
          minutes: null,
          etaLabel: null,
          passed: false,
        };
      }
      const eta = etaForTripAtStop(stops[hit.stopIndex], trip.tripCode);
      const passed = trip.nextStopIndex > hit.stopIndex;
      return {
        id: lmDef.id,
        label: lmDef.label,
        feedName: hit.feedName,
        stopIndex: hit.stopIndex,
        etaIso: eta?.etaIso ?? null,
        minutes: eta?.minutes ?? null,
        etaLabel: eta
          ? formatEtaLabel({ etaIso: eta.etaIso, minutes: eta.minutes })
          : passed
            ? "Passed"
            : null,
        passed,
      };
    });

    return {
      tripCode: trip.tripCode,
      plate,
      landmarks: landmarkEtas,
      progress,
      nextLandmarkId,
    };
  });
}
