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
  { id: "db-ferry-sea-0", name: "Leave Tai Pak Bay", lat: 22.2998, lng: 114.0245 },
  { id: "db-ferry-sea-1", name: "N of Peng Chau approach", lat: 22.3055, lng: 114.042 },
  { id: "db-ferry-sea-2", name: "Western harbour approaches", lat: 22.3065, lng: 114.065 },
  { id: "db-ferry-sea-3", name: "Victoria Harbour (west)", lat: 22.3025, lng: 114.09 },
  { id: "db-ferry-sea-4", name: "Victoria Harbour (mid)", lat: 22.2975, lng: 114.115 },
  { id: "db-ferry-sea-5", name: "Central harbour approach", lat: 22.292, lng: 114.138 },
  { id: "db-ferry-sea-6", name: "Central piers approach", lat: 22.2888, lng: 114.152 },
];

/**
 * Nim Shue Wan → Peng Chau Public Pier sea corridor (east of DB marina channel).
 * Stays in water between Lantau / Discovery Bay and Peng Chau — not a land chord.
 */
export const NSW_PENG_CHAU_SEA_WAYPOINTS: ReadonlyArray<{
  id: string;
  name: string;
  lat: number;
  lng: number;
}> = [
  { id: "nsw-pc-0", name: "Leave Nim Shue Wan", lat: 22.2922, lng: 114.0255 },
  { id: "nsw-pc-1", name: "DB–Peng Chau channel", lat: 22.2905, lng: 114.0315 },
  { id: "nsw-pc-2", name: "West of Peng Chau", lat: 22.2885, lng: 114.036 },
];

/**
 * Peng Chau → Mui Wo (Silver Mine Bay) sea corridor.
 * Curves south of Peng Chau through open water toward Mui Wo landing steps.
 */
export const PENG_CHAU_MUI_WO_SEA_WAYPOINTS: ReadonlyArray<{
  id: string;
  name: string;
  lat: number;
  lng: number;
}> = [
  { id: "pc-mw-0", name: "S of Peng Chau", lat: 22.2835, lng: 114.0365 },
  { id: "pc-mw-1", name: "Channel toward Silver Mine Bay", lat: 22.2755, lng: 114.022 },
  { id: "pc-mw-2", name: "Mui Wo approaches", lat: 22.2685, lng: 114.01 },
];

/**
 * Direct Nim Shue Wan ↔ Mui Wo weekend corridor (not via Peng Chau).
 * Stays west of Peng Chau in Discovery Bay / Silver Mine Bay water.
 */
export const NSW_MUI_WO_DIRECT_SEA_WAYPOINTS: ReadonlyArray<{
  id: string;
  name: string;
  lat: number;
  lng: number;
}> = [
  { id: "nsw-mw-0", name: "Leave Nim Shue Wan S", lat: 22.2905, lng: 114.02 },
  { id: "nsw-mw-1", name: "Discovery Bay channel", lat: 22.282, lng: 114.014 },
  { id: "nsw-mw-2", name: "Toward Silver Mine Bay", lat: 22.2725, lng: 114.006 },
  { id: "nsw-mw-3", name: "Mui Wo harbour approach", lat: 22.267, lng: 114.0025 },
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
