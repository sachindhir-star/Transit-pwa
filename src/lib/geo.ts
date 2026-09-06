/** Shared geo helpers for HK trip planning. */

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  return haversineKm(a, b) * 1000;
}

/** Rough adult Octopus single-ride estimate from straight-line km + harbour flag. */
export function estimateBusFareHkd(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const km = haversineKm(from, to);
  const crossHarbour =
    (from.lat < 22.302 && to.lat > 22.302) || (from.lat > 22.302 && to.lat < 22.302);
  if (crossHarbour) {
    if (km < 6) return 12.1;
    if (km < 12) return 14.8;
    return 20.8;
  }
  if (km < 2.5) return 4.7;
  if (km < 5) return 6.9;
  if (km < 9) return 9.6;
  if (km < 15) return 12.4;
  return 16.5;
}

/** Ride minutes ≈ stops * 1.4 + base, floored by distance heuristic. */
export function estimateRideMin(stopHops: number, km: number): number {
  const byStops = Math.max(4, Math.round(stopHops * 1.35 + 3));
  const byKm = Math.max(5, Math.round(km * 2.8 + 4));
  return Math.round((byStops + byKm) / 2);
}

export function walkMinFromM(metres: number): number {
  // ~4.8 km/h urban walk
  return Math.max(1, Math.round(metres / 80));
}
