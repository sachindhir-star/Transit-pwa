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

/** Load KMB route-stop coordinates for a direction. */
export async function loadKmbShape(
  route: string,
  bound: "outbound" | "inbound" = "outbound",
  serviceType = "1",
): Promise<StopPoint[]> {
  const list = await fetchJson<{ data: KmbRouteStop[] }>(
    kmbUrl(`route-stop/${route}/${bound}/${serviceType}`),
  );
  const stops = list.data ?? [];
  const points: StopPoint[] = [];
  // Cap concurrent fetches
  const slice = stops.slice(0, 40);
  await Promise.all(
    slice.map(async (rs) => {
      try {
        const s = await fetchJson<{ data: KmbStop }>(kmbUrl(`stop/${rs.stop}`));
        const d = s.data;
        if (!d?.lat) return;
        points.push({
          id: d.stop,
          name: d.name_en,
          nameZh: d.name_tc,
          lat: Number(d.lat),
          lng: Number(d.long),
          operatorStopId: d.stop,
        });
      } catch {
        /* skip */
      }
    }),
  );
  // Re-order by seq
  const byId = new Map(points.map((p) => [p.id, p]));
  return slice.map((rs) => byId.get(rs.stop)).filter(Boolean) as StopPoint[];
}

export async function loadCtbShape(
  route: string,
  direction: "inbound" | "outbound" = "outbound",
): Promise<StopPoint[]> {
  const list = await fetchJson<{ data: CtbRouteStop[] }>(
    ctbUrl(`route-stop/ctb/${route}/${direction}`),
  );
  const stops = list.data ?? [];
  const slice = stops.slice(0, 40);
  const points: StopPoint[] = [];
  await Promise.all(
    slice.map(async (rs) => {
      try {
        const s = await fetchJson<{ data: CtbStop }>(ctbUrl(`stop/${rs.stop}`));
        const d = s.data;
        if (!d?.lat) return;
        points.push({
          id: d.stop,
          name: d.name_en,
          nameZh: d.name_tc,
          lat: Number(d.lat),
          lng: Number(d.long),
          operatorStopId: d.stop,
        });
      } catch {
        /* skip */
      }
    }),
  );
  const byId = new Map(points.map((p) => [p.id, p]));
  return slice.map((rs) => byId.get(rs.stop)).filter(Boolean) as StopPoint[];
}
