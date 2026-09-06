import type { StopPoint } from "../types";

export type DbTrackingMode = "schedule" | "live-gps" | "eta-inferred";

export interface DbBusRoute {
  id: string;
  number: string;
  name: string;
  nameZh?: string;
  /** Circular / termini description */
  summary: string;
  /** Adult Octopus estimate */
  fareHkd: number;
  /** Typical headway minutes (schedule hint) */
  headwayMin: number;
  trackingMode: DbTrackingMode;
  trackingNote: string;
  /** Ordered stop shape for the map (approx public map centres) */
  stops: StopPoint[];
  /** Preferred highlight routes for DB residents */
  featured?: boolean;
}

const s = (
  id: string,
  name: string,
  lat: number,
  lng: number,
  nameZh?: string,
): StopPoint => ({ id, name, lat, lng, nameZh });

/**
 * Curated DB internal route shapes (ALS / map centres).
 * DBTSL has no public vehicle GPS or open ETA API — trackingMode is schedule.
 */
export const DB_BUS_ROUTES: DbBusRoute[] = [
  {
    id: "db-c4",
    number: "C4",
    name: "Coastline Villa ↺ DB North",
    nameZh: "碧濤軒 ↺ 愉景灣北",
    summary: "Clockwise circular via Plaza / Seabird / Parkridge / Siena / Chianti",
    fareHkd: 6.8,
    headwayMin: 12,
    featured: true,
    trackingMode: "schedule",
    trackingNote:
      "DBTSL C4 — no public live GPS or open ETA feed. Route shape is curated; no fake bus dots.",
    stops: [
      s("c4-1", "Coastline Villa", 22.29434, 114.02334, "碧濤軒"),
      s("c4-2", "La Costa / Marina Drive", 22.29566, 114.02039, "海澄湖畔"),
      s("c4-3", "DB Plaza Bus Terminus", 22.29544, 114.01685, "愉景灣廣場"),
      s("c4-4", "Elegance Court", 22.29442, 114.0146, "雅濤閣"),
      s("c4-5", "Seabird Lane", 22.29581, 114.01428, "海燕徑"),
      s("c4-6", "Headland / Parkridge", 22.30219, 114.01148, "碧麗宮"),
      s("c4-7", "Siena Two", 22.30664, 114.01118, "海澄灣"),
      s("c4-8", "Club Siena / Amalfi", 22.30701, 114.01426),
      s("c4-9", "Chianti / Neo Horizon", 22.30798, 114.01289, "倚濤軒"),
      s("c4-10", "Greenvale Village", 22.3053, 114.00951, "翠湖村"),
      s("c4-11", "DB North (Siena)", 22.3025, 114.0105, "愉景灣北"),
      s("c4-12", "Parkridge return", 22.30253, 114.01172),
      s("c4-13", "DB Plaza return", 22.29544, 114.01685, "愉景灣廣場"),
      s("c4-14", "Coastline Villa", 22.29434, 114.02334, "碧濤軒"),
    ],
  },
  {
    id: "db-c9",
    number: "C9",
    name: "Crestmont Villa ↺ DB North",
    nameZh: "翠山灣 ↺ 愉景灣北",
    summary: "Anti-clockwise circular paired with C4 via Plaza / North estates",
    fareHkd: 6.8,
    headwayMin: 12,
    featured: true,
    trackingMode: "schedule",
    trackingNote:
      "DBTSL C9 — no public live GPS or open ETA feed. Route shape is curated; no fake bus dots.",
    stops: [
      s("c9-1", "Crestmont Villa", 22.29681, 114.02343, "翠山灣"),
      s("c9-2", "La Costa", 22.29566, 114.02039, "海澄湖畔"),
      s("c9-3", "DB Plaza Bus Terminus", 22.29544, 114.01685, "愉景灣廣場"),
      s("c9-4", "Seabird Lane", 22.29581, 114.01428, "海燕徑"),
      s("c9-5", "Parkridge Village", 22.30219, 114.01148, "碧麗宮"),
      s("c9-6", "Siena One / Two", 22.3043, 114.01196, "海澄灣"),
      s("c9-7", "DB North Plaza area", 22.3025, 114.0105, "愉景灣北"),
      s("c9-8", "Greenvale / Neo Horizon", 22.30752, 114.00979, "翠湖村"),
      s("c9-9", "Chianti", 22.30798, 114.01289, "倚濤軒"),
      s("c9-10", "Positano / Amalfi", 22.30669, 114.01457),
      s("c9-11", "Parkridge return", 22.30253, 114.01172),
      s("c9-12", "DB Plaza return", 22.29544, 114.01685, "愉景灣廣場"),
      s("c9-13", "Crestmont Villa", 22.29681, 114.02343, "翠山灣"),
    ],
  },
  {
    id: "db-1",
    number: "1",
    name: "DB Plaza ↺ Headland Drive",
    nameZh: "廣場 ↺ 蔚陽",
    summary: "Internal loop toward Headland Village",
    fareHkd: 6.8,
    headwayMin: 15,
    trackingMode: "schedule",
    trackingNote: "DBTSL Route 1 — schedule only; no open GPS/ETA.",
    stops: [
      s("1-a", "DB Plaza Bus Terminus", 22.29544, 114.01685),
      s("1-b", "Elegance Court", 22.29442, 114.0146),
      s("1-c", "Seabird Lane", 22.29581, 114.01428),
      s("1-d", "Headland Drive", 22.30155, 114.01157),
      s("1-e", "Parkridge", 22.30219, 114.01148),
      s("1-f", "DB Plaza Bus Terminus", 22.29544, 114.01685),
    ],
  },
  {
    id: "db-2",
    number: "2",
    name: "DB Plaza ↺ Midvale",
    nameZh: "廣場 ↺ 明翠台",
    summary: "Internal loop toward Midvale",
    fareHkd: 6.8,
    headwayMin: 15,
    trackingMode: "schedule",
    trackingNote: "DBTSL Route 2 — schedule only; no open GPS/ETA.",
    stops: [
      s("2-a", "DB Plaza Bus Terminus", 22.29544, 114.01685),
      s("2-b", "Midvale", 22.2968, 114.01148),
      s("2-c", "Parkvale area", 22.2985, 114.0125),
      s("2-d", "DB Plaza Bus Terminus", 22.29544, 114.01685),
    ],
  },
  {
    id: "db-3",
    number: "3",
    name: "DB Plaza ↺ Parkvale",
    nameZh: "廣場 ↺ 寶峰",
    summary: "Internal loop toward Parkvale",
    fareHkd: 6.8,
    headwayMin: 15,
    trackingMode: "schedule",
    trackingNote: "DBTSL Route 3 — schedule only; no open GPS/ETA.",
    stops: [
      s("3-a", "DB Plaza Bus Terminus", 22.29544, 114.01685),
      s("3-b", "La Serene", 22.29317, 114.01751),
      s("3-c", "Midvale / Parkvale", 22.2968, 114.01148),
      s("3-d", "DB Plaza Bus Terminus", 22.29544, 114.01685),
    ],
  },
  {
    id: "db-5",
    number: "5",
    name: "DB Plaza ↺ La Serene",
    nameZh: "廣場 ↺ 海寧居",
    summary: "Internal loop toward La Serene / Peninsula",
    fareHkd: 6.2,
    headwayMin: 15,
    trackingMode: "schedule",
    trackingNote: "DBTSL Route 5 — schedule only; no open GPS/ETA.",
    stops: [
      s("5-a", "DB Plaza Bus Terminus", 22.29544, 114.01685),
      s("5-b", "La Serene", 22.29317, 114.01751),
      s("5-c", "Coastline Villa", 22.29434, 114.02334),
      s("5-d", "DB Plaza Bus Terminus", 22.29544, 114.01685),
    ],
  },
  {
    id: "db-6",
    number: "6",
    name: "DB Plaza ↺ Seabee Lane",
    nameZh: "廣場 ↺ 海蜂徑",
    summary: "Internal loop toward Seabee / Beach Village",
    fareHkd: 6.2,
    headwayMin: 15,
    trackingMode: "schedule",
    trackingNote: "DBTSL Route 6 — schedule only; no open GPS/ETA.",
    stops: [
      s("6-a", "DB Plaza Bus Terminus", 22.29544, 114.01685),
      s("6-b", "Elegance Court", 22.29442, 114.0146),
      s("6-c", "Seabird / Seabee", 22.29581, 114.01428),
      s("6-d", "DB Plaza Bus Terminus", 22.29544, 114.01685),
    ],
  },
  {
    id: "db-15",
    number: "15",
    name: "Chianti ↔ DB Plaza",
    nameZh: "倚濤軒 ↔ 廣場",
    summary: "North estates link to Plaza",
    fareHkd: 6.8,
    headwayMin: 20,
    trackingMode: "schedule",
    trackingNote: "DBTSL Route 15 — schedule only; no open GPS/ETA.",
    stops: [
      s("15-a", "Chianti", 22.30798, 114.01289),
      s("15-b", "Siena / Neo Horizon", 22.30752, 114.00979),
      s("15-c", "Parkridge", 22.30219, 114.01148),
      s("15-d", "DB Plaza Bus Terminus", 22.29544, 114.01685),
    ],
  },
  {
    id: "db-18",
    number: "18",
    name: "DB Plaza ↔ Discovery Peak",
    nameZh: "廣場 ↔ 尚瑚灣",
    summary: "Link toward IL PICCO / Discovery Peak",
    fareHkd: 6.8,
    headwayMin: 30,
    trackingMode: "schedule",
    trackingNote: "DBTSL Route 18 — schedule only; no open GPS/ETA.",
    stops: [
      s("18-a", "DB Plaza Bus Terminus", 22.29544, 114.01685),
      s("18-b", "Parkridge", 22.30219, 114.01148),
      s("18-c", "Siena North", 22.30664, 114.01118),
      s("18-d", "Discovery Peak area", 22.3105, 114.0085),
    ],
  },
];

export const DB_MAP_CENTER: [number, number] = [22.2995, 114.0155];
export const DB_MAP_ZOOM = 15;
