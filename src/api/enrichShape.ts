import { asShapePoints, snapStopsToRoads } from "./roadGeometry";
import { loadCtbShape, loadKmbShape } from "./routeShape";
import type { StopPoint, TripLeg, TripOption } from "../types";

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

/**
 * Prefer operator open-data stop sequences (Citybus / KMB), then snap consecutive
 * stops to the driving network (OSRM) so locked routes follow roads — not chords.
 * Official route polylines are not in the ETA APIs or TD GTFS (no shapes.txt).
 */
export async function enrichTripShapes(trip: TripOption): Promise<TripOption> {
  const legs: TripLeg[] = await Promise.all(
    trip.legs.map(async (leg) => {
      if (!leg.route || (leg.mode !== "CTB" && leg.mode !== "KMB")) {
        return leg;
      }
      try {
        let full: StopPoint[] = [];
        if (leg.mode === "CTB") {
          const dir = leg.direction === "inbound" ? "inbound" : "outbound";
          full = await loadCtbShape(leg.route, dir);
        } else if (leg.mode === "KMB") {
          const bound =
            leg.direction === "inbound" || leg.direction === "I" ? "inbound" : "outbound";
          full = await loadKmbShape(leg.route, bound, leg.serviceType ?? "1");
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
    }),
  );
  return { ...trip, legs };
}
