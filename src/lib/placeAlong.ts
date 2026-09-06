import type { LatLng } from "../api/roadGeometry";

/** Haversine distance in metres. */
export function distM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Initial bearing from a → b in degrees clockwise from north (0–360). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export interface AlongResult {
  lat: number;
  lng: number;
  /** Heading along the polyline at this point (toward increasing distance). */
  heading: number;
  /** Metres from polyline start. */
  distanceM: number;
}

function cumulative(line: LatLng[]): number[] {
  const cum = [0];
  for (let i = 1; i < line.length; i++) {
    cum.push(cum[i - 1] + distM(line[i - 1], line[i]));
  }
  return cum;
}

/** Point + heading at a given distance along the polyline. */
export function pointAtDistance(line: LatLng[], distanceM: number): AlongResult | null {
  if (line.length < 2) {
    if (!line.length) return null;
    return { lat: line[0].lat, lng: line[0].lng, heading: 0, distanceM: 0 };
  }
  const cum = cumulative(line);
  const total = cum[cum.length - 1];
  const d = Math.min(Math.max(0, distanceM), total);
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1] < d) i++;
  const segLen = cum[i + 1] - cum[i] || 1;
  const t = (d - cum[i]) / segLen;
  const a = line[i];
  const b = line[i + 1];
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
    heading: bearingDeg(a, b),
    distanceM: d,
  };
}

/** Distance along polyline of the vertex nearest to `target`. */
export function nearestDistanceAlong(line: LatLng[], target: LatLng): number {
  if (line.length === 0) return 0;
  const cum = cumulative(line);
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < line.length; i++) {
    const d = distM(line[i], target);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return cum[bestI];
}

/**
 * Place a bus approaching `next` along `road`, slightly upstream based on ETA.
 * Heading is the road direction toward the next stop.
 */
export function placeApproachingStop(
  road: LatLng[],
  next: LatLng,
  prev: LatLng | null,
  etaMinutes: number,
): AlongResult | null {
  if (road.length < 2) {
    return next
      ? { lat: next.lat, lng: next.lng, heading: 0, distanceM: 0 }
      : null;
  }
  const nextDist = nearestDistanceAlong(road, next);
  let prevDist = 0;
  if (prev) {
    prevDist = nearestDistanceAlong(road, prev);
    // If prev maps after next (circular wrap), treat prev as a short back-off
    if (prevDist >= nextDist) {
      prevDist = Math.max(0, nextDist - 180);
    }
  } else {
    prevDist = Math.max(0, nextDist - 180);
  }
  const span = Math.max(40, nextDist - prevDist);
  // 0 min → ~95% toward next stop; 10+ min → nearer previous
  const frac = Math.min(0.95, Math.max(0.15, 1 - Math.min(etaMinutes, 12) / 14));
  const at = prevDist + span * frac;
  const pos = pointAtDistance(road, at);
  if (!pos) return null;
  // Prefer heading looking ahead toward the next-stop distance
  const ahead = pointAtDistance(road, Math.min(nextDist, at + 25));
  if (ahead && (ahead.lat !== pos.lat || ahead.lng !== pos.lng)) {
    return { ...pos, heading: bearingDeg(pos, ahead) };
  }
  return pos;
}
