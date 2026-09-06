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

/** Ordered polyline for a DB↔Central ferry leg (board → sea waypoints → alight). */
export function dbFerrySeaShape(from: StopPoint, to: StopPoint): StopPoint[] {
  const fromIsDb =
    /db.?ferry|discovery.?bay/i.test(from.id + " " + from.name) ||
    (from.lng < 114.06 && from.lat > 22.29);
  const waypoints = fromIsDb
    ? DB_FERRY_SEA_WAYPOINTS
    : [...DB_FERRY_SEA_WAYPOINTS].reverse();
  return [
    asStop(from),
    ...waypoints.map((w) => asStop(w)),
    asStop(to),
  ];
}

export function isDbFerryLeg(leg: {
  mode: string;
  route?: string;
}): boolean {
  if (leg.mode !== "FERRY") return false;
  const r = leg.route ?? "";
  return /db.?ferry/i.test(r) || r === "DB-Ferry";
}
