import type { StopPoint } from "../types";
import { haversineM } from "../lib/geo";

export interface CtbStopRec {
  id: string;
  name: string;
  nameZh?: string;
  lat: number;
  lng: number;
}

interface CtbIndexFile {
  generated: string;
  routes: Record<
    string,
    { origEn?: string; destEn?: string; origTc?: string; destTc?: string }
  >;
  routeStops: Record<string, string[]>;
  stops: Record<string, CtbStopRec>;
}

export interface CtbNearStop {
  stop: CtbStopRec;
  metres: number;
}

export interface CtbDirectLeg {
  route: string;
  dir: "O" | "I";
  direction: "outbound" | "inbound";
  fromStop: StopPoint;
  toStop: StopPoint;
  stopHops: number;
  walkFromM: number;
  walkToM: number;
  destLabel: string;
}

let loadPromise: Promise<CtbIndexFile | null> | null = null;
let index: CtbIndexFile | null = null;
/** stopId → list of {routeKey, seqIndex} */
let stopToRoutes: Map<string, { key: string; seq: number }[]> | null = null;

function indexUrl(): string {
  const base = import.meta.env.BASE_URL || "./";
  // Keep relative ./ so GitHub Pages / preview subpaths work
  return new URL(`${base}data/ctb-index.json`, window.location.href).href;
}

export async function ensureCtbIndex(): Promise<boolean> {
  if (index) return true;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const res = await fetch(indexUrl());
        if (!res.ok) throw new Error(`CTB index HTTP ${res.status}`);
        const data = (await res.json()) as CtbIndexFile;
        index = data;
        stopToRoutes = new Map();
        for (const [key, seq] of Object.entries(data.routeStops)) {
          seq.forEach((sid, i) => {
            const arr = stopToRoutes!.get(sid) ?? [];
            arr.push({ key, seq: i });
            stopToRoutes!.set(sid, arr);
          });
        }
        return data;
      } catch (e) {
        console.warn("CTB index load failed", e);
        loadPromise = null;
        return null;
      }
    })();
  }
  return !!(await loadPromise);
}

export function nearestCtbStops(
  lat: number,
  lng: number,
  opts: { limit?: number; maxMetres?: number } = {},
): CtbNearStop[] {
  if (!index) return [];
  const limit = opts.limit ?? 12;
  const maxMetres = opts.maxMetres ?? 550;
  const out: CtbNearStop[] = [];
  for (const stop of Object.values(index.stops)) {
    const m = haversineM({ lat, lng }, stop);
    if (m <= maxMetres) out.push({ stop, metres: m });
  }
  out.sort((a, b) => a.metres - b.metres);
  return out.slice(0, limit);
}

function toStopPoint(s: CtbStopRec): StopPoint {
  return {
    id: s.id,
    name: s.name,
    nameZh: s.nameZh,
    lat: s.lat,
    lng: s.lng,
    operatorStopId: s.id,
  };
}

function destLabel(route: string, dir: "O" | "I"): string {
  const meta = index?.routes[route];
  if (!meta) return route;
  return dir === "O" ? meta.destEn || meta.destTc || route : meta.origEn || meta.origTc || route;
}

/**
 * Find direct Citybus journeys: a route/dir that boards near `from` and alights near `to`
 * with boarding seq < alighting seq.
 */
export function findCtbDirectLegs(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  opts: { maxMetres?: number; limit?: number } = {},
): CtbDirectLeg[] {
  if (!index || !stopToRoutes) return [];
  const maxMetres = opts.maxMetres ?? 550;
  const limit = opts.limit ?? 8;
  const nearFrom = nearestCtbStops(from.lat, from.lng, { maxMetres, limit: 14 });
  const nearTo = nearestCtbStops(to.lat, to.lng, { maxMetres, limit: 14 });
  if (!nearFrom.length || !nearTo.length) return [];

  const toById = new Map(nearTo.map((n) => [n.stop.id, n]));
  type Cand = CtbDirectLeg & { score: number };
  const bestByRoute = new Map<string, Cand>();

  for (const nf of nearFrom) {
    const refs = stopToRoutes.get(nf.stop.id) ?? [];
    for (const { key, seq: fromSeq } of refs) {
      const [route, d] = key.split("|") as [string, string];
      const dir = (d === "I" ? "I" : "O") as "O" | "I";
      const seq = index.routeStops[key] ?? [];
      for (let j = fromSeq + 1; j < seq.length; j++) {
        const tid = seq[j];
        const nt = toById.get(tid);
        if (!nt) continue;
        const walkFromM = nf.metres;
        const walkToM = nt.metres;
        const stopHops = j - fromSeq;
        const score = walkFromM + walkToM + stopHops * 40 + (/^N\d/i.test(route) ? 5000 : 0);
        const uniq = `${route}|${dir}`;
        const leg: Cand = {
          route,
          dir,
          direction: dir === "I" ? "inbound" : "outbound",
          fromStop: toStopPoint(nf.stop),
          toStop: toStopPoint(nt.stop),
          stopHops,
          walkFromM,
          walkToM,
          destLabel: destLabel(route, dir),
          score,
        };
        const prev = bestByRoute.get(uniq);
        if (!prev || score < prev.score) bestByRoute.set(uniq, leg);
      }
    }
  }

  return [...bestByRoute.values()]
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ score: _s, ...rest }) => rest);
}
