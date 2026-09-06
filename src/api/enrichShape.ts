import {
  asShapePoints,
  snapStopsToRoads,
  snapWalkToFootpathsDetailed,
} from "./roadGeometry";
import { loadCtbShape, loadKmbShape } from "./routeShape";
import type { StopPoint, TripLeg, TripOption } from "../types";

/** Shown on map when OSRM foot fails — never silently look like a real path. */
export const APPROX_WALK_NOTE = "Approximate walk (no footpath geometry)";

/** Shown when OSRM foot snap succeeded. */
export const FOOT_WALK_NOTE = "Walking leg · footpath geometry";

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

function isWalkLeg(leg: TripLeg): boolean {
  return leg.mode === "WALK" || leg.trackingMode === "walk";
}

/**
 * True when the walk polyline is still a board→alight chord (or missing geometry).
 * Used so we never claim “footpath geometry” for a 2-point straight line.
 */
export function isWalkChord(leg: TripLeg): boolean {
  if (!isWalkLeg(leg)) return false;
  if (leg.shape.length < 3) return true;
  // Success path tags vertices with foot-* ids via asShapePoints(..., "foot")
  const hasFootVerts = leg.shape.some((p) => String(p.id).startsWith("foot-"));
  return !hasFootVerts;
}

export function isApproxWalkLeg(leg: TripLeg): boolean {
  if (!isWalkLeg(leg)) return false;
  if (leg.notes?.includes(APPROX_WALK_NOTE)) return true;
  return isWalkChord(leg);
}

function stripWalkGeometryNotes(notes?: string): string | undefined {
  if (!notes) return undefined;
  const next = notes
    .split(" · ")
    .map((p) => p.trim())
    .filter((p) => p && p !== APPROX_WALK_NOTE && p !== FOOT_WALK_NOTE)
    .join(" · ");
  return next || undefined;
}

export function withApproxWalkNote(leg: TripLeg): TripLeg {
  const base = stripWalkGeometryNotes(leg.notes);
  return {
    ...leg,
    notes: base ? `${base} · ${APPROX_WALK_NOTE}` : APPROX_WALK_NOTE,
  };
}

function withFootWalkNote(leg: TripLeg): TripLeg {
  const base = stripWalkGeometryNotes(leg.notes);
  return {
    ...leg,
    notes: base ? `${base} · ${FOOT_WALK_NOTE}` : FOOT_WALK_NOTE,
  };
}

/** Mark every walk leg as approximate chord (lock/enrich hard-fail path). */
export function markWalksApproximate(trip: TripOption): TripOption {
  return {
    ...trip,
    legs: trip.legs.map((leg) => {
      if (!isWalkLeg(leg)) return leg;
      return withApproxWalkNote({
        ...leg,
        shape: leg.shape.length >= 2 ? leg.shape : [leg.fromStop, leg.toStop],
      });
    }),
  };
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
    return withApproxWalkNote({
      ...leg,
      shape: leg.shape.length >= 2 ? leg.shape : [from, to],
    });
  }

  try {
    const result = await snapWalkToFootpathsDetailed(from, to);
    // Require a real polyline (not a 2-point echo of the chord)
    if (result.source === "osrm" && result.points.length >= 3) {
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
      return withFootWalkNote({
        ...leg,
        shape: pts,
      });
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
      if (isWalkLeg(leg)) {
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

/** Re-snap a single walk leg (e.g. when user switches to it and it is still a chord). */
export async function enrichWalkLegIfNeeded(leg: TripLeg): Promise<TripLeg> {
  if (!isWalkLeg(leg)) return leg;
  if (!isWalkChord(leg) && leg.notes?.includes(FOOT_WALK_NOTE)) return leg;
  if (!isWalkChord(leg) && leg.shape.length >= 3) return withFootWalkNote(leg);
  return enrichWalkLeg(leg);
}
