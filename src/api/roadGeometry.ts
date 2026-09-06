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

/** Walk snap with explicit quality — never label a huge OSRM detour as footpath. */
export type WalkPathQuality = "footpath" | "approximate";

export interface WalkSnapResult extends SnapResult {
  /** Chosen polyline length (or chord length when approximate). */
  routeDistanceM: number;
  /** Straight-line origin→destination. */
  straightDistanceM: number;
  quality: WalkPathQuality;
}

interface OsrmRouteHit {
  coords: [number, number][];
  distanceM: number;
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

function pathLengthM(points: LatLng[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += distM(points[i - 1], points[i]);
  }
  return sum;
}

/**
 * Reject absurd OSRM foot detours (e.g. 5.5 km U-turn for a 280 m school walk).
 * Short walks: reject ratio ≳ 3.2× or >550 m extra. Longer walks: slightly looser.
 */
export function isAcceptableFootDistance(routeM: number, straightM: number): boolean {
  if (!Number.isFinite(routeM) || routeM <= 0) return false;
  const straight = Math.max(straightM, 1);
  const ratio = routeM / straight;
  const extra = routeM - straightM;
  // Short walks: allow modest pedestrian detours (~3× / ≤550 m extra) but reject
  // absurd U-turns (e.g. 5 km for a 280 m school walk).
  if (straightM <= 1000) {
    return ratio <= 3.2 && extra <= 550;
  }
  if (straightM <= 2500) {
    return ratio <= 2.75 && extra <= 900;
  }
  return ratio <= 2.5;
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

async function fetchOsrmRouteHits(
  coordsPath: string,
  profile: OsrmProfile = "driving",
  extraParams = "",
): Promise<OsrmRouteHit[]> {
  const params = ["overview=full", "geometries=geojson", extraParams]
    .filter(Boolean)
    .join("&");
  let lastErr: unknown;
  for (const url of osrmCandidates(coordsPath, params, profile)) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), OSRM_TIMEOUT_MS);
    try {
      const data = await fetchJson<{
        code?: string;
        routes?: {
          distance?: number;
          geometry?: { coordinates?: [number, number][] };
        }[];
      }>(url, { signal: ctrl.signal });
      if (data.code !== "Ok" || !data.routes?.length) continue;
      const hits: OsrmRouteHit[] = [];
      for (const route of data.routes) {
        const coords = route.geometry?.coordinates;
        if (!coords || coords.length < 2) continue;
        const poly = coords.map(([lng, lat]) => ({ lat, lng }));
        const distanceM =
          typeof route.distance === "number" && route.distance > 0
            ? route.distance
            : pathLengthM(poly);
        hits.push({ coords, distanceM });
      }
      if (hits.length) return hits;
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastErr) console.warn(`OSRM ${profile} fetch failed`, lastErr);
  return [];
}

async function fetchOsrmRoute(
  coordsPath: string,
  profile: OsrmProfile = "driving",
): Promise<[number, number][] | null> {
  const hits = await fetchOsrmRouteHits(coordsPath, profile);
  return hits[0]?.coords ?? null;
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

function jitterPoint(p: LatLng, dLat: number, dLng: number): LatLng {
  return { lat: p.lat + dLat, lng: p.lng + dLng };
}

/** ~metres → degrees at HK latitudes. */
function metresToDeg(metres: number): { dLat: number; dLng: number } {
  const dLat = metres / 111_320;
  const dLng = metres / (111_320 * Math.cos((22.35 * Math.PI) / 180));
  return { dLat, dLng };
}

interface WalkCandidate {
  points: LatLng[];
  distanceM: number;
  /** Keep true endpoints even when we jittered the OSRM query. */
  from: LatLng;
  to: LatLng;
}

async function collectWalkCandidates(
  from: LatLng,
  to: LatLng,
): Promise<WalkCandidate[]> {
  const found: WalkCandidate[] = [];
  const seen = new Set<string>();
  const straight = distM(from, to);

  const remember = (hit: OsrmRouteHit) => {
    const key = `${hit.distanceM.toFixed(0)}:${hit.coords.length}:${hit.coords[0]?.[0]?.toFixed(5)}:${hit.coords[hit.coords.length - 1]?.[1]?.toFixed(5)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const pts = hit.coords.map(([lng, lat]) => ({ lat, lng }));
    // Anchor to the real A/B so the map still starts/ends on the places.
    if (pts.length >= 2) {
      pts[0] = { ...from };
      pts[pts.length - 1] = { ...to };
    }
    found.push({ points: pts, distanceM: hit.distanceM, from, to });
  };

  const hasAcceptable = () =>
    found.some((c) => isAcceptableFootDistance(c.distanceM, straight));

  const queryPair = async (
    a: LatLng,
    b: LatLng,
    extraParams: string,
  ): Promise<void> => {
    const path = `${a.lng},${a.lat};${b.lng},${b.lat}`;
    const hits = await fetchOsrmRouteHits(path, "foot", extraParams);
    for (const hit of hits) remember(hit);
  };

  // 1) Default route first — most walks are fine without retries.
  await queryPair(from, to, "");
  if (hasAcceptable()) return found;

  // 2) Alternates / continue_straight (still same endpoints).
  await queryPair(from, to, "alternatives=true");
  if (hasAcceptable()) return found;
  await Promise.all([
    queryPair(from, to, "continue_straight=true"),
    queryPair(from, to, "continue_straight=false"),
  ]);
  if (hasAcceptable()) return found;

  // If the best candidate so far is wildly absurd (e.g. 5 km U-turn for a 280 m
  // school walk), skip jitter — OSM has no usable foot link; approximate chord.
  const bestSoFar = found.length
    ? Math.min(...found.map((c) => c.distanceM))
    : Infinity;
  const bestRatio = bestSoFar / Math.max(straight, 1);
  if (straight <= 1000 && bestRatio > 4.5) {
    return found;
  }

  // 3) Mild detours only: endpoint jitter can recover from bad highway snaps.
  const rings = straight <= 1000 ? [45, 90, 150] : [60, 120];
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [0.7, 0.7],
    [0.7, -0.7],
    [-0.7, 0.7],
    [-0.7, -0.7],
  ];

  for (const metres of rings) {
    const { dLat, dLng } = metresToDeg(metres);
    const jobs: Promise<void>[] = [];
    for (const [ns, ew] of dirs) {
      jobs.push(queryPair(jitterPoint(from, ns * dLat, ew * dLng), to, ""));
      jobs.push(queryPair(from, jitterPoint(to, ns * dLat, ew * dLng), ""));
    }
    const CONC = 6;
    for (let i = 0; i < jobs.length; i += CONC) {
      await Promise.all(jobs.slice(i, i + CONC));
      if (hasAcceptable()) return found;
    }
  }

  return found;
}

/**
 * Snap a walk A→B via OSRM foot profile, rejecting absurd detours.
 * Retries alternatives / continue_straight / endpoint jitter; if nothing is
 * within the quality gate, returns a labeled approximate chord.
 */
export async function snapWalkToFootpathsDetailed(
  from: LatLng,
  to: LatLng,
): Promise<WalkSnapResult> {
  const straightDistanceM = distM(from, to);
  if (
    !Number.isFinite(from.lat) ||
    !Number.isFinite(from.lng) ||
    !Number.isFinite(to.lat) ||
    !Number.isFinite(to.lng) ||
    straightDistanceM < 1
  ) {
    return {
      points: [from, to],
      source: "stop-chords",
      osrmSegments: 0,
      failedSegments: 0,
      routeDistanceM: straightDistanceM,
      straightDistanceM,
      quality: "approximate",
    };
  }

  let candidates: WalkCandidate[] = [];
  try {
    candidates = await collectWalkCandidates(from, to);
  } catch (e) {
    console.warn("Walk foot candidate collection failed", e);
  }

  const acceptable = candidates
    .filter((c) => c.points.length >= 3)
    .filter((c) => isAcceptableFootDistance(c.distanceM, straightDistanceM))
    .sort((a, b) => a.distanceM - b.distanceM);

  if (acceptable.length > 0) {
    const best = acceptable[0];
    return {
      points: best.points,
      source: "osrm",
      osrmSegments: 1,
      failedSegments: 0,
      routeDistanceM: best.distanceM,
      straightDistanceM,
      quality: "footpath",
    };
  }

  // No trustworthy foot geometry — do not claim footpath (dashed approx chord).
  if (candidates.length > 0) {
    const shortest = [...candidates].sort((a, b) => a.distanceM - b.distanceM)[0];
    console.warn(
      `OSRM foot rejected as absurd detour: ${Math.round(shortest.distanceM)} m vs ${Math.round(straightDistanceM)} m straight`,
    );
  }

  return {
    points: [from, to],
    source: "stop-chords",
    osrmSegments: 0,
    failedSegments: 1,
    routeDistanceM: straightDistanceM,
    straightDistanceM,
    quality: "approximate",
  };
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
