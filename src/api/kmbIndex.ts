import { fetchJson, kmbUrl } from "./client";
import type { StopPoint } from "../types";
import { haversineM } from "../lib/geo";

interface KmbStopRow {
  stop: string;
  name_en: string;
  name_tc?: string;
  lat: string;
  long: string;
}

interface KmbRouteStopRow {
  route: string;
  bound: string;
  service_type: string;
  seq: string;
  stop: string;
}

export interface KmbStopRec {
  id: string;
  name: string;
  nameZh?: string;
  lat: number;
  lng: number;
}

export interface KmbNearStop {
  stop: KmbStopRec;
  metres: number;
}

export interface KmbDirectLeg {
  route: string;
  bound: "O" | "I";
  direction: "outbound" | "inbound";
  serviceType: string;
  fromStop: StopPoint;
  toStop: StopPoint;
  stopHops: number;
  walkFromM: number;
  walkToM: number;
}

let ready = false;
let loadPromise: Promise<boolean> | null = null;
let stops: KmbStopRec[] = [];
let stopById = new Map<string, KmbStopRec>();
/** stopId → occurrences on routes */
let stopToRoutes = new Map<
  string,
  { route: string; bound: "O" | "I"; serviceType: string; seq: number }[]
>();
/** route|bound|serviceType → ordered stop ids */
let routeSeq = new Map<string, string[]>();

function routeKey(route: string, bound: string, serviceType: string) {
  return `${route}|${bound}|${serviceType}`;
}

export async function ensureKmbIndex(): Promise<boolean> {
  if (ready) return true;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const [stopRes, rsRes] = await Promise.all([
          fetchJson<{ data: KmbStopRow[] }>(kmbUrl("stop")),
          fetchJson<{ data: KmbRouteStopRow[] }>(kmbUrl("route-stop")),
        ]);
        stops = [];
        stopById = new Map();
        for (const row of stopRes.data ?? []) {
          const lat = Number(row.lat);
          const lng = Number(row.long);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          const rec: KmbStopRec = {
            id: row.stop,
            name: row.name_en,
            nameZh: row.name_tc,
            lat,
            lng,
          };
          stops.push(rec);
          stopById.set(rec.id, rec);
        }

        stopToRoutes = new Map();
        routeSeq = new Map();
        const tmpSeq = new Map<string, { seq: number; stop: string }[]>();
        for (const row of rsRes.data ?? []) {
          const bound = (row.bound === "I" ? "I" : "O") as "O" | "I";
          const st = row.service_type || "1";
          const seq = Number(row.seq);
          const key = routeKey(row.route, bound, st);
          const arr = tmpSeq.get(key) ?? [];
          arr.push({ seq, stop: row.stop });
          tmpSeq.set(key, arr);
          const inv = stopToRoutes.get(row.stop) ?? [];
          inv.push({ route: row.route, bound, serviceType: st, seq });
          stopToRoutes.set(row.stop, inv);
        }
        for (const [key, arr] of tmpSeq) {
          arr.sort((a, b) => a.seq - b.seq);
          routeSeq.set(
            key,
            arr.map((x) => x.stop),
          );
        }
        ready = true;
        return true;
      } catch (e) {
        console.warn("KMB index load failed", e);
        loadPromise = null;
        return false;
      }
    })();
  }
  return loadPromise;
}

export function nearestKmbStops(
  lat: number,
  lng: number,
  opts: { limit?: number; maxMetres?: number } = {},
): KmbNearStop[] {
  if (!ready) return [];
  const limit = opts.limit ?? 12;
  const maxMetres = opts.maxMetres ?? 550;
  const out: KmbNearStop[] = [];
  for (const stop of stops) {
    const m = haversineM({ lat, lng }, stop);
    if (m <= maxMetres) out.push({ stop, metres: m });
  }
  out.sort((a, b) => a.metres - b.metres);
  return out.slice(0, limit);
}

function toStopPoint(s: KmbStopRec): StopPoint {
  return {
    id: s.id,
    name: s.name,
    nameZh: s.nameZh,
    lat: s.lat,
    lng: s.lng,
    operatorStopId: s.id,
  };
}

export function findKmbDirectLegs(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  opts: { maxMetres?: number; limit?: number } = {},
): KmbDirectLeg[] {
  if (!ready) return [];
  const maxMetres = opts.maxMetres ?? 550;
  const limit = opts.limit ?? 8;
  const nearFrom = nearestKmbStops(from.lat, from.lng, { maxMetres, limit: 14 });
  const nearTo = nearestKmbStops(to.lat, to.lng, { maxMetres, limit: 14 });
  if (!nearFrom.length || !nearTo.length) return [];

  const toById = new Map(nearTo.map((n) => [n.stop.id, n]));
  type Cand = KmbDirectLeg & { score: number };
  const best = new Map<string, Cand>();

  for (const nf of nearFrom) {
    const refs = stopToRoutes.get(nf.stop.id) ?? [];
    for (const ref of refs) {
      const key = routeKey(ref.route, ref.bound, ref.serviceType);
      const seq = routeSeq.get(key) ?? [];
      // find from index in ordered seq (ref.seq is 1-based typically)
      let fromIdx = seq.indexOf(nf.stop.id);
      if (fromIdx < 0) {
        // fallback: match by seq number
        fromIdx = Math.max(0, ref.seq - 1);
        if (seq[fromIdx] !== nf.stop.id) continue;
      }
      for (let j = fromIdx + 1; j < seq.length; j++) {
        const tid = seq[j];
        const nt = toById.get(tid);
        if (!nt) continue;
        const walkFromM = nf.metres;
        const walkToM = nt.metres;
        const stopHops = j - fromIdx;
        const score = walkFromM + walkToM + stopHops * 40;
        const uniq = `${ref.route}|${ref.bound}|${ref.serviceType}`;
        const leg: Cand = {
          route: ref.route,
          bound: ref.bound,
          direction: ref.bound === "I" ? "inbound" : "outbound",
          serviceType: ref.serviceType,
          fromStop: toStopPoint(nf.stop),
          toStop: toStopPoint(nt.stop),
          stopHops,
          walkFromM,
          walkToM,
          score,
        };
        const prev = best.get(uniq);
        if (!prev || score < prev.score) best.set(uniq, leg);
      }
    }
  }

  return [...best.values()]
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ score: _s, ...rest }) => rest);
}
