import {
  asShapePoints,
  snapStopsToRoads,
  snapWalkToFootpathsDetailed,
} from "./roadGeometry";
import { loadCtbShape, loadKmbShape } from "./routeShape";
import type { StopPoint, TripLeg, TripOption } from "../types";

/** Shown on map when OSRM foot fails — never silently look like a real path. */
export const APPROX_WALK_NOTE = "approximate walk (no footpath geometry)";

function dist2(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dlat = a.lat - b.lat;
  const dlng = a.lng - b.lng;
  return dlat * dlat + dlng * dlng;
}

function nearestIndex(shape: StopPoint[], target: { lat: number; lng: number }) {
  let best = 0;
  let bestD = Infinity;
  shape.forEach((p, i) => {
    const d = dist2(p, target);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

async function roadShapeFromStops(ordered: StopPoint[]): Promise<StopPoint[]> {
  if (ordered.length < 2) return ordered;
  const snapped = await snapStopsToRoads(ordered);
  if (snapped.length < 2) return ordered;
  // Keep named endpoints for popups; intermediate vertices are road geometry
  const pts = asShapePoints(snapped, "road");
  pts[0] = {
    ...pts[0],
    id: ordered[0].id,
    name: ordered[0].name,
    nameZh: ordered[0].nameZh,
    operatorStopId: ordered[0].operatorStopId,
  };
  const last = ordered[ordered.length - 1];
  pts[pts.length - 1] = {
    ...pts[pts.length - 1],
    id: last.id,
    name: last.name,
    nameZh: last.nameZh,
    operatorStopId: last.operatorStopId,
  };
  return pts;
}

function withApproxWalkNote(leg: TripLeg): TripLeg {
  if (leg.notes?.includes(APPROX_WALK_NOTE)) return leg;
  return {
    ...leg,
    notes: leg.notes ? `${leg.notes} · ${APPROX_WALK_NOTE}` : APPROX_WALK_NOTE,
  };
}

/** Snap a WALK leg to the pedestrian network (OSRM foot). */
async function enrichWalkLeg(leg: TripLeg): Promise<TripLeg> {
  const from = leg.fromStop;
  const to = leg.toStop;
  if (
    !Number.isFinite(from.lat) ||
    !Number.isFinite(from.lng) ||
    !Number.isFinite(to.lat) ||
    !Number.isFinite(to.lng)
  ) {
    return withApproxWalkNote(leg);
  }

  try {
    const result = await snapWalkToFootpathsDetailed(from, to);
    if (result.source === "osrm" && result.points.length >= 2) {
      const pts = asShapePoints(result.points, "foot");
      pts[0] = {
        ...pts[0],
        id: from.id,
        name: from.name,
        nameZh: from.nameZh,
        operatorStopId: from.operatorStopId,
      };
      pts[pts.length - 1] = {
        ...pts[pts.length - 1],
        id: to.id,
        name: to.name,
        nameZh: to.nameZh,
        operatorStopId: to.operatorStopId,
      };
      // Drop any prior approximate label if we got real foot geometry
      const notes = leg.notes
        ?.split(" · ")
        .filter((p) => p !== APPROX_WALK_NOTE)
        .join(" · ");
      return {
        ...leg,
        shape: pts,
        notes: notes || undefined,
      };
    }
  } catch (e) {
    console.warn("Walk foot-snap failed", e);
  }

  // Straight chord fallback — labeled so it does not look like a real path
  return withApproxWalkNote({
    ...leg,
    shape: leg.shape.length >= 2 ? leg.shape : [from, to],
  });
}

async function enrichBusLeg(leg: TripLeg): Promise<TripLeg> {
  try {
    let full: StopPoint[] = [];
    if (leg.mode === "CTB") {
      const dir = leg.direction === "inbound" ? "inbound" : "outbound";
      full = await loadCtbShape(leg.route!, dir);
    } else if (leg.mode === "KMB") {
      const bound =
        leg.direction === "inbound" || leg.direction === "I" ? "inbound" : "outbound";
      full = await loadKmbShape(leg.route!, bound, leg.serviceType ?? "1");
    }

    // Fall back to curated stop list when operator fetch is empty/sparse
    const base = full.length >= 2 ? full : leg.shape;
    if (base.length < 2) return leg;

    const fromIdx = nearestIndex(base, leg.fromStop);
    const toIdx = nearestIndex(base, leg.toStop);
    const start = Math.min(fromIdx, toIdx);
    const end = Math.max(fromIdx, toIdx);
    let slice = base.slice(start, end + 1);
    if (slice.length < 2) slice = base;
    const ordered = fromIdx <= toIdx ? slice : [...slice].reverse();

    const board = ordered[0];
    const alight = ordered[ordered.length - 1];
    const road = await roadShapeFromStops(ordered);

    const dir =
      leg.eta?.dir ??
      (leg.direction === "inbound" || leg.direction === "I"
        ? "I"
        : leg.direction === "outbound" || leg.direction === "O"
          ? "O"
          : undefined);

    return {
      ...leg,
      fromStop: {
        ...board,
        name: board.name || leg.fromStop.name,
      },
      toStop: {
        ...alight,
        name: alight.name || leg.toStop.name,
      },
      shape: road,
      eta: leg.eta
        ? {
            ...leg.eta,
            stopId: board.operatorStopId || board.id,
            dir,
          }
        : undefined,
    };
  } catch (e) {
    console.warn("Shape enrich failed", leg.route, e);
    // Last resort: still try road-snap of curated shape so we never leave a chord
    try {
      if (leg.shape.length >= 2) {
        return { ...leg, shape: await roadShapeFromStops(leg.shape) };
      }
    } catch {
      /* keep original */
    }
    return leg;
  }
}

/**
 * Prefer operator open-data stop sequences (Citybus / KMB), then snap consecutive
 * stops to the driving network (OSRM) so locked bus legs follow roads — not chords.
 * WALK legs use OSRM foot so they follow footpaths instead of cutting through buildings.
 * Official route polylines are not in the ETA APIs or TD GTFS (no shapes.txt).
 */
export async function enrichTripShapes(trip: TripOption): Promise<TripOption> {
  const legs: TripLeg[] = await Promise.all(
    trip.legs.map(async (leg) => {
      if (leg.mode === "WALK" || leg.trackingMode === "walk") {
        return enrichWalkLeg(leg);
      }
      if (!leg.route || (leg.mode !== "CTB" && leg.mode !== "KMB")) {
        return leg;
      }
      return enrichBusLeg(leg);
    }),
  );
  return { ...trip, legs };
}
