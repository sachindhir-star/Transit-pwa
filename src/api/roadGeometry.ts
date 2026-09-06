import { fetchJson } from "./client";
import type { StopPoint } from "../types";

export interface LatLng {
  lat: number;
  lng: number;
}

export type OsrmProfile = "driving" | "foot";

export type SnapSource = "osrm" | "mixed" | "stop-chords";

export interface SnapResult {
  points: LatLng[];
  source: SnapSource;
  osrmSegments: number;
  failedSegments: number;
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

const OSRM_TIMEOUT_MS = 8000;

/**
 * Prefer same-origin Vite proxy (`/api/osrm` → project-osrm.org) for preview CORS,
 * then fall back to the public OSRM host. Profile is driving (bus) or foot (walk).
 * Each candidate is hard-timeout so a hung proxy cannot block foot snap forever.
 */
function osrmCandidates(
  coordsPath: string,
  params: string,
  profile: OsrmProfile,
): string[] {
  const qs = `?${params}`;
  const publicUrl = `https://router.project-osrm.org/route/v1/${profile}/${coordsPath}${qs}`;
  return [`/api/osrm/route/v1/${profile}/${coordsPath}${qs}`, publicUrl];
}

async function fetchOsrmRoute(
  coordsPath: string,
  profile: OsrmProfile = "driving",
): Promise<[number, number][] | null> {
  const params = "overview=full&geometries=geojson";
  let lastErr: unknown;
  for (const url of osrmCandidates(coordsPath, params, profile)) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), OSRM_TIMEOUT_MS);
    try {
      const data = await fetchJson<{
        code?: string;
        routes?: { geometry?: { coordinates?: [number, number][] } }[];
      }>(url, { signal: ctrl.signal });
      const coords = data.routes?.[0]?.geometry?.coordinates;
      if (data.code === "Ok" && coords && coords.length >= 2) return coords;
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastErr) console.warn(`OSRM ${profile} fetch failed`, lastErr);
  return null;
}

/** One stop→stop leg via OSRM, with one retry after a short pause. */
async function snapSegment(
  a: LatLng,
  b: LatLng,
  profile: OsrmProfile,
): Promise<LatLng[] | null> {
  const path = `${a.lng},${a.lat};${b.lng},${b.lat}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const coords = await fetchOsrmRoute(path, profile);
    if (coords?.length) {
      return coords.map(([lng, lat]) => ({ lat, lng }));
    }
    if (attempt === 0) {
      await new Promise((r) => setTimeout(r, 180));
    }
  }
  return null;
}

/**
 * Snap an ordered stop sequence to the OSRM network (driving or foot).
 * Snaps consecutive stop pairs (retrying each) so a long multi-waypoint call
 * cannot silently collapse the whole route to stop-to-stop chords.
 */
export async function snapStopsToRoadsDetailed(
  stops: LatLng[],
  profile: OsrmProfile = "driving",
): Promise<SnapResult> {
  const clean = stops.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && (p.lat !== 0 || p.lng !== 0),
  );
  if (clean.length < 2) {
    return { points: clean, source: "stop-chords", osrmSegments: 0, failedSegments: 0 };
  }

  const deduped: LatLng[] = [clean[0]];
  for (let i = 1; i < clean.length; i++) {
    if (distM(deduped[deduped.length - 1], clean[i]) > 8) deduped.push(clean[i]);
  }
  if (deduped.length < 2) {
    return { points: clean, source: "stop-chords", osrmSegments: 0, failedSegments: 0 };
  }

  // Try a single multi-waypoint call first (fast when it works).
  if (deduped.length <= 40) {
    const path = deduped.map((p) => `${p.lng},${p.lat}`).join(";");
    const coords = await fetchOsrmRoute(path, profile);
    if (coords && coords.length >= deduped.length) {
      return {
        points: coords.map(([lng, lat]) => ({ lat, lng })),
        source: "osrm",
        osrmSegments: deduped.length - 1,
        failedSegments: 0,
      };
    }
  }

  // Segment-by-segment with limited concurrency.
  const parts: LatLng[] = [{ ...deduped[0] }];
  let osrmSegments = 0;
  let failedSegments = 0;
  const CONCURRENCY = 4;

  for (let i = 0; i < deduped.length - 1; i += CONCURRENCY) {
    const batch: Promise<{ idx: number; line: LatLng[] | null }>[] = [];
    for (let j = i; j < Math.min(deduped.length - 1, i + CONCURRENCY); j++) {
      const idx = j;
      batch.push(
        snapSegment(deduped[idx], deduped[idx + 1], profile).then((line) => ({
          idx,
          line,
        })),
      );
    }
    const results = await Promise.all(batch);
    results.sort((a, b) => a.idx - b.idx);
    for (const { idx, line } of results) {
      if (line && line.length >= 2) {
        osrmSegments += 1;
        parts.push(...line.slice(1));
      } else {
        failedSegments += 1;
        // Labeled fallback: keep the straight stop chord for this segment only.
        parts.push({ ...deduped[idx + 1] });
      }
    }
  }

  const source: SnapSource =
    failedSegments === 0 ? "osrm" : osrmSegments === 0 ? "stop-chords" : "mixed";

  return {
    points: parts.length >= 2 ? parts : clean,
    source,
    osrmSegments,
    failedSegments,
  };
}

/** Backward-compatible helper used by CTB/KMB enrich (driving roads). */
export async function snapStopsToRoads(stops: LatLng[]): Promise<LatLng[]> {
  return (await snapStopsToRoadsDetailed(stops, "driving")).points;
}

/** Snap a walk A→B via OSRM foot profile (footpaths / pedestrian network). */
export async function snapWalkToFootpathsDetailed(
  from: LatLng,
  to: LatLng,
): Promise<SnapResult> {
  return snapStopsToRoadsDetailed([from, to], "foot");
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
