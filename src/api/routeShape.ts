import type { StopPoint } from "../types";
import { ctbUrl, fetchJson, kmbUrl } from "./client";

interface KmbRouteStop {
  seq: string;
  stop: string;
}
interface KmbStop {
  stop: string;
  name_en: string;
  name_tc: string;
  lat: string;
  long: string;
}
interface CtbRouteStop {
  seq: number;
  stop: string;
}
interface CtbStop {
  stop: string;
  name_en: string;
  name_tc: string;
  lat: string;
  long: string;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R | null>,
): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch {
        out[i] = null;
      }
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

function toStopPoint(
  id: string,
  name: string,
  nameZh: string | undefined,
  lat: number,
  lng: number,
): StopPoint | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { id, name, nameZh, lat, lng, operatorStopId: id };
}

/** Load KMB route-stop coordinates for a direction (ordered by seq). */
export async function loadKmbShape(
  route: string,
  bound: "outbound" | "inbound" = "outbound",
  serviceType = "1",
): Promise<StopPoint[]> {
  const list = await fetchJson<{ data: KmbRouteStop[] }>(
    kmbUrl(`route-stop/${route}/${bound}/${serviceType}`),
  );
  const stops = [...(list.data ?? [])].sort(
    (a, b) => Number(a.seq) - Number(b.seq),
  );
  // Full sequence — do not hard-cap; concurrency pool avoids stampeding the API
  const fetched = await mapPool(stops, 6, async (rs) => {
    const s = await fetchJson<{ data: KmbStop }>(kmbUrl(`stop/${rs.stop}`));
    const d = s.data;
    if (!d?.lat) return null;
    return toStopPoint(d.stop, d.name_en, d.name_tc, Number(d.lat), Number(d.long));
  });
  const points = fetched.filter(Boolean) as StopPoint[];
  // Require most stops so we never replace a curated polyline with a sparse chord
  if (points.length < 2) return [];
  if (stops.length >= 4 && points.length < Math.ceil(stops.length * 0.6)) {
    console.warn("KMB shape too sparse", route, points.length, "/", stops.length);
    return [];
  }
  // Preserve seq order using successful fetches only
  const byId = new Map(points.map((p) => [p.id, p]));
  return stops.map((rs) => byId.get(rs.stop)).filter(Boolean) as StopPoint[];
}

export async function loadCtbShape(
  route: string,
  direction: "inbound" | "outbound" = "outbound",
): Promise<StopPoint[]> {
  const list = await fetchJson<{ data: CtbRouteStop[] }>(
    ctbUrl(`route-stop/ctb/${route}/${direction}`),
  );
  const stops = [...(list.data ?? [])].sort((a, b) => a.seq - b.seq);
  const fetched = await mapPool(stops, 6, async (rs) => {
    const s = await fetchJson<{ data: CtbStop }>(ctbUrl(`stop/${rs.stop}`));
    const d = s.data;
    if (!d?.lat) return null;
    return toStopPoint(d.stop, d.name_en, d.name_tc, Number(d.lat), Number(d.long));
  });
  const points = fetched.filter(Boolean) as StopPoint[];
  if (points.length < 2) return [];
  if (stops.length >= 4 && points.length < Math.ceil(stops.length * 0.6)) {
    console.warn("CTB shape too sparse", route, points.length, "/", stops.length);
    return [];
  }
  const byId = new Map(points.map((p) => [p.id, p]));
  return stops.map((rs) => byId.get(rs.stop)).filter(Boolean) as StopPoint[];
}
