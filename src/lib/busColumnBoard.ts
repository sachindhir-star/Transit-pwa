import type { DbtslStopEta } from "../api/dbtslEta";
import { parseTripCode } from "../api/dbtslEta";
import { formatEtaLabel } from "./formatEta";
import { listActiveTrips, type TripFocus } from "./dbSuggest";

export interface RouteBoardDef {
  route: "C4" | "C9";
  title: string;
  emptyLabel: string;
}

export const C4_BOARD: RouteBoardDef = {
  route: "C4",
  title: "C4",
  emptyLabel: "No active C4 trips right now",
};

export const C9_BOARD: RouteBoardDef = {
  route: "C9",
  title: "C9",
  emptyLabel: "No active C9 trips right now",
};

export interface ColumnStopEta {
  /** Index into get_bus_stops sequence (top → bottom). */
  stopIndex: number;
  label: string;
  etaIso: string | null;
  minutes: number | null;
  etaLabel: string | null;
  /** Bus already passed this stop on the trip. */
  passed: boolean;
}

export interface BusColumnModel {
  tripCode: string;
  plate: string;
  stops: ColumnStopEta[];
  /**
   * 0 = at first stop, 1 = at last.
   * Derived from next-stop index + ETAs (ETA-inferred, not GPS).
   */
  progress: number;
  nextStopIndex: number | null;
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

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Place the bus along the full stop column (route order).
 * Honesty: uses stop sequence + ETAs only (same idea as the map).
 */
export function inferColumnProgress(
  trip: TripFocus,
  stopCount: number,
  stops: DbtslStopEta[],
): { progress: number; nextStopIndex: number | null } {
  if (stopCount < 2) {
    return { progress: 0, nextStopIndex: trip.nextStopIndex };
  }

  const nextIdx = trip.nextStopIndex;
  const lastIdx = stopCount - 1;

  // Past final stop → sit at the bottom.
  if (nextIdx > lastIdx) {
    return { progress: 1, nextStopIndex: null };
  }

  if (nextIdx <= 0) {
    const hit = etaForTripAtStop(stops[0], trip.tripCode);
    const pull = hit ? Math.min(0.12, hit.minutes / 40) : 0.04;
    return {
      progress: clamp01(0.02 - pull * 0.1),
      nextStopIndex: 0,
    };
  }

  const prevIdx = nextIdx - 1;
  // Soften with ETA minutes between previous and next when available.
  let frac = 0.55;
  const etaNext = etaForTripAtStop(stops[nextIdx], trip.tripCode);
  const etaPrev = etaForTripAtStop(stops[prevIdx], trip.tripCode);
  if (etaNext && etaPrev && etaNext.minutes > etaPrev.minutes) {
    const segMins = Math.max(1, etaNext.minutes - etaPrev.minutes);
    const remaining = Math.max(
      0,
      etaNext.minutes - (trip.upcoming[0]?.minutes ?? etaNext.minutes),
    );
    frac = clamp01(1 - remaining / segMins);
  } else if (etaNext) {
    // Pull slightly back from the next stop when ETA is still a few minutes out.
    const pull = Math.min(0.45, etaNext.minutes / 20);
    frac = 1 - pull;
  }

  // Don't sit exactly on next unless ETA says we're there (0 mins).
  if (etaNext && etaNext.minutes > 0) {
    frac = Math.min(frac, 0.92);
  } else if (etaNext && etaNext.minutes === 0) {
    frac = 1;
  }

  const progress = (prevIdx + clamp01(frac)) / lastIdx;
  return {
    progress: clamp01(progress),
    nextStopIndex: nextIdx,
  };
}

/** Build one column per active trip with every stop in feed order. */
export function buildBusColumns(
  stops: DbtslStopEta[] | null | undefined,
  _def: RouteBoardDef,
): BusColumnModel[] {
  if (!stops?.length) return [];

  const trips = listActiveTrips(stops);
  return trips.map((trip) => {
    const { plate } = parseTripCode(trip.tripCode);
    const { progress, nextStopIndex } = inferColumnProgress(
      trip,
      stops.length,
      stops,
    );

    const stopRows: ColumnStopEta[] = stops.map((stop, stopIndex) => {
      const eta = etaForTripAtStop(stop, trip.tripCode);
      const passed = trip.nextStopIndex > stopIndex;
      return {
        stopIndex,
        label: stop.stop,
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
      stops: stopRows,
      progress,
      nextStopIndex,
    };
  });
}
