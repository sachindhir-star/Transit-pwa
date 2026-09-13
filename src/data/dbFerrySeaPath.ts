import type { StopPoint } from "../types";

/**
 * Approximate DB Pier ↔ Central Pier 3 sea corridor.
 * Multi-point harbour waypoints stay in open water (north of Peng Chau /
 * Hei Ling Chau approaches) — not a pier-to-pier land chord.
 */
export const DB_FERRY_SEA_WAYPOINTS: ReadonlyArray<{
  id: string;
  name: string;
  lat: number;
  lng: number;
}> = [
  { id: "db-ferry-sea-0", name: "Leave Tai Pak Bay NE", lat: 22.2985, lng: 114.0205 },
  { id: "db-ferry-sea-1", name: "Leave Tai Pak Bay", lat: 22.3005, lng: 114.026 },
  { id: "db-ferry-sea-2", name: "NE of Discovery Bay", lat: 22.3035, lng: 114.033 },
  { id: "db-ferry-sea-3", name: "N of Peng Chau approach", lat: 22.3055, lng: 114.042 },
  { id: "db-ferry-sea-4", name: "N of Peng Chau channel", lat: 22.3065, lng: 114.052 },
  { id: "db-ferry-sea-5", name: "Western harbour approaches", lat: 22.3065, lng: 114.065 },
  { id: "db-ferry-sea-6", name: "Western harbour", lat: 22.3045, lng: 114.078 },
  { id: "db-ferry-sea-7", name: "Victoria Harbour (west)", lat: 22.3025, lng: 114.09 },
  { id: "db-ferry-sea-8", name: "Victoria Harbour (mid-west)", lat: 22.3, lng: 114.102 },
  { id: "db-ferry-sea-9", name: "Victoria Harbour (mid)", lat: 22.2975, lng: 114.115 },
  { id: "db-ferry-sea-10", name: "Victoria Harbour (mid-east)", lat: 22.2945, lng: 114.128 },
  { id: "db-ferry-sea-11", name: "Central harbour approach", lat: 22.2915, lng: 114.14 },
  { id: "db-ferry-sea-12", name: "Central piers approach", lat: 22.289, lng: 114.15 },
  { id: "db-ferry-sea-13", name: "Near Central Pier 3", lat: 22.288, lng: 114.1555 },
];

/**
 * Nim Shue Wan → Peng Chau Public Pier sea corridor.
 * Short eastbound channel between Lantau / Discovery Bay and Peng Chau —
 * stays north of channel islets, west of Peng Chau shore.
 */
export const NSW_PENG_CHAU_SEA_WAYPOINTS: ReadonlyArray<{
  id: string;
  name: string;
  lat: number;
  lng: number;
}> = [
  { id: "nsw-pc-0", name: "Leave Nim Shue Wan E", lat: 22.2928, lng: 114.025 },
  { id: "nsw-pc-1", name: "DB–Peng Chau channel", lat: 22.292, lng: 114.029 },
  { id: "nsw-pc-2", name: "Channel mid (N of islets)", lat: 22.2908, lng: 114.033 },
  { id: "nsw-pc-3", name: "West of Peng Chau", lat: 22.2892, lng: 114.036 },
  { id: "nsw-pc-4", name: "Peng Chau pier approach", lat: 22.2878, lng: 114.0378 },
];

/**
 * Peng Chau → Mui Wo (Silver Mine Bay) sea corridor.
 * South of Peng Chau through open water east of Lantau, then round SE of
 * Man Kok headland into Silver Mine Bay — never across Peng Chau or Lantau hills.
 */
export const PENG_CHAU_MUI_WO_SEA_WAYPOINTS: ReadonlyArray<{
  id: string;
  name: string;
  lat: number;
  lng: number;
}> = [
  { id: "pc-mw-0", name: "Leave Peng Chau S", lat: 22.2855, lng: 114.038 },
  { id: "pc-mw-1", name: "S of Peng Chau", lat: 22.2815, lng: 114.0375 },
  { id: "pc-mw-2", name: "Open water S of Peng Chau", lat: 22.2775, lng: 114.0365 },
  { id: "pc-mw-3", name: "Channel toward Silver Mine Bay", lat: 22.2735, lng: 114.0345 },
  { id: "pc-mw-4", name: "East of Man Kok approaches", lat: 22.27, lng: 114.0305 },
  { id: "pc-mw-5", name: "SE of Man Kok headland", lat: 22.267, lng: 114.0275 },
  { id: "pc-mw-6", name: "Round into Silver Mine Bay", lat: 22.265, lng: 114.024 },
  { id: "pc-mw-7", name: "Silver Mine Bay (east)", lat: 22.2646, lng: 114.0175 },
  { id: "pc-mw-8", name: "Silver Mine Bay (mid)", lat: 22.2645, lng: 114.0105 },
  { id: "pc-mw-9", name: "Mui Wo harbour approach", lat: 22.2645, lng: 114.005 },
];

/**
 * Direct Nim Shue Wan ↔ Mui Wo weekend corridor (not via Peng Chau).
 * Leave NSW east into the water channel → south in open water east of Lantau
 * (lng roughly ≥ 114.03 mid-section, west of Peng Chau) → round SE of Man Kok
 * into Silver Mine Bay → Mui Wo. Never a SW land chord over Tai Shui Hang hills.
 */
export const NSW_MUI_WO_DIRECT_SEA_WAYPOINTS: ReadonlyArray<{
  id: string;
  name: string;
  lat: number;
  lng: number;
}> = [
  { id: "nsw-mw-0", name: "Leave Nim Shue Wan E", lat: 22.2925, lng: 114.025 },
  { id: "nsw-mw-1", name: "Into DB–Peng Chau channel", lat: 22.2912, lng: 114.029 },
  { id: "nsw-mw-2", name: "Channel east of Lantau", lat: 22.289, lng: 114.0335 },
  { id: "nsw-mw-3", name: "West of Peng Chau", lat: 22.286, lng: 114.0358 },
  { id: "nsw-mw-4", name: "SW of Peng Chau", lat: 22.282, lng: 114.0368 },
  { id: "nsw-mw-5", name: "Open water S of Peng Chau", lat: 22.278, lng: 114.0365 },
  { id: "nsw-mw-6", name: "South in channel (east of Lantau)", lat: 22.274, lng: 114.0345 },
  { id: "nsw-mw-7", name: "Toward Silver Mine Bay SE", lat: 22.2705, lng: 114.0305 },
  { id: "nsw-mw-8", name: "East of Man Kok headland", lat: 22.2675, lng: 114.0275 },
  { id: "nsw-mw-9", name: "Round SE into Silver Mine Bay", lat: 22.2652, lng: 114.024 },
  { id: "nsw-mw-10", name: "Silver Mine Bay (east)", lat: 22.2646, lng: 114.0175 },
  { id: "nsw-mw-11", name: "Silver Mine Bay (mid)", lat: 22.2645, lng: 114.0105 },
  { id: "nsw-mw-12", name: "Mui Wo harbour approach", lat: 22.2645, lng: 114.005 },
];

export const FERRY_SEA_CORRIDOR_NOTE =
  "Sea corridor (approx harbour route) · ferry timetable — no live vessel GPS";

function asStop(p: {
  id: string;
  name: string;
  lat: number;
  lng: number;
  nameZh?: string;
  operatorStopId?: string;
}): StopPoint {
  return {
    id: p.id,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    nameZh: p.nameZh,
    operatorStopId: p.operatorStopId,
  };
}

function reverseWaypoints<T>(arr: ReadonlyArray<T>): T[] {
  return [...arr].reverse();
}

/** Ordered polyline for a DB↔Central ferry leg (board → sea waypoints → alight). */
export function dbFerrySeaShape(from: StopPoint, to: StopPoint): StopPoint[] {
  const fromIsDb =
    /db.?ferry|discovery.?bay/i.test(from.id + " " + from.name) ||
    (from.lng < 114.06 && from.lat > 22.29);
  const waypoints = fromIsDb
    ? DB_FERRY_SEA_WAYPOINTS
    : reverseWaypoints(DB_FERRY_SEA_WAYPOINTS);
  return [asStop(from), ...waypoints.map((w) => asStop(w)), asStop(to)];
}

export function isDbFerryLeg(leg: {
  mode: string;
  route?: string;
}): boolean {
  if (leg.mode !== "FERRY") return false;
  const r = leg.route ?? "";
  return /db.?ferry/i.test(r) || r === "DB-Ferry";
}

export type KaitoSeaMode = "via-peng-chau" | "direct";

/**
 * Sea polyline for Peng Chau Kaito corridor.
 * via-peng-chau: Nim Shue Wan ↔ Peng Chau ↔ Mui Wo
 * direct: Nim Shue Wan ↔ Mui Wo (weekend / PH)
 */
export function kaitoSeaShape(
  pierStops: StopPoint[],
  mode: KaitoSeaMode,
): StopPoint[] {
  if (pierStops.length < 2) return pierStops.map(asStop);

  if (mode === "direct") {
    const from = pierStops[0];
    const to = pierStops[pierStops.length - 1];
    const fromIsNsw = /nim.?shue|nsw/i.test(from.id + from.name);
    const waypoints = fromIsNsw
      ? NSW_MUI_WO_DIRECT_SEA_WAYPOINTS
      : reverseWaypoints(NSW_MUI_WO_DIRECT_SEA_WAYPOINTS);
    return [asStop(from), ...waypoints.map((w) => asStop(w)), asStop(to)];
  }

  // via Peng Chau: chain NSW↔PC + PC↔Mui Wo segments in boarding order
  const out: StopPoint[] = [];
  for (let i = 0; i < pierStops.length; i++) {
    out.push(asStop(pierStops[i]));
    if (i >= pierStops.length - 1) break;
    const a = pierStops[i];
    const b = pierStops[i + 1];
    const pair = `${a.id}|${b.id}`;
    let mid: ReadonlyArray<{ id: string; name: string; lat: number; lng: number }>;
    if (/nim.?shue|nsw/i.test(a.id) && /peng.?chau/i.test(b.id)) {
      mid = NSW_PENG_CHAU_SEA_WAYPOINTS;
    } else if (/peng.?chau/i.test(a.id) && /nim.?shue|nsw/i.test(b.id)) {
      mid = reverseWaypoints(NSW_PENG_CHAU_SEA_WAYPOINTS);
    } else if (/peng.?chau/i.test(a.id) && /mui.?wo/i.test(b.id)) {
      mid = PENG_CHAU_MUI_WO_SEA_WAYPOINTS;
    } else if (/mui.?wo/i.test(a.id) && /peng.?chau/i.test(b.id)) {
      mid = reverseWaypoints(PENG_CHAU_MUI_WO_SEA_WAYPOINTS);
    } else if (/nim.?shue|nsw/i.test(a.id) && /mui.?wo/i.test(b.id)) {
      // Full via path without explicit PC stop in list — use NSW→PC→Mui Wo water
      mid = [
        ...NSW_PENG_CHAU_SEA_WAYPOINTS,
        { id: "via-pc-mid", name: "Peng Chau approach", lat: 22.287, lng: 114.0385 },
        ...PENG_CHAU_MUI_WO_SEA_WAYPOINTS,
      ];
    } else if (/mui.?wo/i.test(a.id) && /nim.?shue|nsw/i.test(b.id)) {
      mid = reverseWaypoints([
        ...NSW_PENG_CHAU_SEA_WAYPOINTS,
        { id: "via-pc-mid", name: "Peng Chau approach", lat: 22.287, lng: 114.0385 },
        ...PENG_CHAU_MUI_WO_SEA_WAYPOINTS,
      ]);
    } else {
      mid = [];
    }
    void pair;
    for (const w of mid) out.push(asStop(w));
  }
  return out;
}
