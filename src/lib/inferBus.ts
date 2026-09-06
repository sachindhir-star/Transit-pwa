import type { InferredBus, LiveEta, StopPoint } from "../types";
import { formatEtaLabel } from "./formatEta";

/** Linear interpolate along polyline by fraction t in [0,1]. */
function along(shape: StopPoint[], t: number): { lat: number; lng: number } {
  if (shape.length === 0) return { lat: 0, lng: 0 };
  if (shape.length === 1) return { lat: shape[0].lat, lng: shape[0].lng };
  const clamped = Math.min(1, Math.max(0, t));
  const seg = (shape.length - 1) * clamped;
  const i = Math.min(shape.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = shape[i];
  const b = shape[i + 1];
  return {
    lat: a.lat + (b.lat - a.lat) * f,
    lng: a.lng + (b.lng - a.lng) * f,
  };
}

/**
 * Place "buses" on the route shape from ETA minutes.
 * NEVER claims GPS — always mode: eta-inferred.
 * Heuristic: nearer ETA → closer to boarding stop (start of shape).
 * Shape should be road-following polyline (board → alight).
 */
export function inferBusesFromEta(
  shape: StopPoint[],
  etas: LiveEta[],
  horizonMin = 45,
): InferredBus[] {
  if (!shape.length) return [];
  return etas
    .filter((e) => e.minutes != null)
    .slice(0, 3)
    .map((e, idx) => {
      const m = e.minutes!;
      // 0 min ≈ at boarding stop; larger ETA ≈ further upstream along reverse of board→alight
      // Without upstream geometry, keep markers near the boarding end of the road polyline.
      const t = Math.min(0.35, Math.max(0.01, (m / horizonMin) * 0.35));
      const pos = along(shape, t);
      return {
        id: `eta-bus-${idx}-${m}`,
        lat: pos.lat,
        lng: pos.lng,
        etaMinutes: m,
        label: `${formatEtaLabel({ etaIso: e.etaIso, minutes: m }) ?? `${m} mins`} · ETA-inferred (not GPS)`,
        mode: "eta-inferred" as const,
      };
    });
}
