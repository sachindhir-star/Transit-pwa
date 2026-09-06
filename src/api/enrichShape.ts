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

/** Replace coarse curated shapes with operator stop sequences when available. */
export async function enrichTripShapes(trip: TripOption): Promise<TripOption> {
  const legs: TripLeg[] = await Promise.all(
    trip.legs.map(async (leg) => {
      if (!leg.route) return leg;
      try {
        let full: StopPoint[] = [];
        if (leg.mode === "CTB") {
          const dir = leg.direction === "inbound" ? "inbound" : "outbound";
          full = await loadCtbShape(leg.route, dir);
        } else if (leg.mode === "KMB") {
          const bound = leg.direction === "inbound" || leg.direction === "I" ? "inbound" : "outbound";
          full = await loadKmbShape(leg.route, bound, leg.serviceType ?? "1");
        } else {
          return leg;
        }
        if (full.length < 2) return leg;

        const fromIdx = nearestIndex(full, leg.fromStop);
        const toIdx = nearestIndex(full, leg.toStop);
        const start = Math.min(fromIdx, toIdx);
        const end = Math.max(fromIdx, toIdx);
        const slice = full.slice(start, end + 1);
        if (slice.length < 2) return leg;

        const board = fromIdx <= toIdx ? slice[0] : slice[slice.length - 1];
        const alight = fromIdx <= toIdx ? slice[slice.length - 1] : slice[0];
        const ordered = fromIdx <= toIdx ? slice : [...slice].reverse();

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
          shape: ordered,
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
        return leg;
      }
    }),
  );
  return { ...trip, legs };
}
