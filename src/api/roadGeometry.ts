import { fetchJson } from "./client";
import type { StopPoint } from "../types";

export interface LatLng {
  lat: number;
  lng: number;
}

function osrmUrl(coordsPath: string, params: string): string {
  const isDev = import.meta.env.DEV;
  const base = isDev
    ? `/api/osrm/route/v1/driving/${coordsPath}`
    : `https://router.project-osrm.org/route/v1/driving/${coordsPath}`;
  return `${base}?${params}`;
}

/** Haversine distance in metres. */
function distM(a: LatLng, b: LatLng): number {
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

/**
 * Snap an ordered stop sequence to the driving road network via OSRM.
 * Prefer operator open-data stop order first; OSRM only fills geometry between stops
 * (no official Citybus/KMB polyline in the ETA APIs / TD GTFS).
 */
export async function snapStopsToRoads(stops: LatLng[]): Promise<LatLng[]> {
  const clean = stops.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && (p.lat !== 0 || p.lng !== 0),
  );
  if (clean.length < 2) return clean;

  // Dedupe near-identical consecutive points (OSRM dislikes zero-length legs)
  const deduped: LatLng[] = [clean[0]];
  for (let i = 1; i < clean.length; i++) {
    if (distM(deduped[deduped.length - 1], clean[i]) > 8) deduped.push(clean[i]);
  }
  if (deduped.length < 2) return clean;

  // OSRM public demo: keep waypoint count modest; chunk long corridors
  const CHUNK = 40;
  const parts: LatLng[] = [];
  for (let start = 0; start < deduped.length - 1; start += CHUNK - 1) {
    const chunk = deduped.slice(start, Math.min(deduped.length, start + CHUNK));
    if (chunk.length < 2) break;
    try {
      const path = chunk.map((p) => `${p.lng},${p.lat}`).join(";");
      const data = await fetchJson<{
        code?: string;
        routes?: { geometry?: { coordinates?: [number, number][] } }[];
      }>(osrmUrl(path, "overview=full&geometries=geojson"));
      const coords = data.routes?.[0]?.geometry?.coordinates;
      if (!coords?.length) continue;
      const latlngs = coords.map(([lng, lat]) => ({ lat, lng }));
      if (parts.length && latlngs.length) {
        // Avoid duplicating the shared chunk join vertex
        parts.push(...latlngs.slice(1));
      } else {
        parts.push(...latlngs);
      }
    } catch (e) {
      console.warn("OSRM snap chunk failed", e);
    }
  }

  return parts.length >= 2 ? parts : clean;
}

/** Turn dense lat/lngs into StopPoint shape vertices for the map / ETA place-along. */
export function asShapePoints(line: LatLng[], labelPrefix = "via"): StopPoint[] {
  return line.map((p, i) => ({
    id: `${labelPrefix}-${i}`,
    name: i === 0 || i === line.length - 1 ? labelPrefix : "",
    lat: p.lat,
    lng: p.lng,
  }));
}
