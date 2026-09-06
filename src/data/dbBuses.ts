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
 * Curated DB internal route shapes as offline fallback.
 * C4/C9 stop order + coords aligned to https://eta.dbtsl.com get_bus_stops.
 * Live ETAs also come from that feed. No vehicle GPS — eta-inferred markers.
 */
export const DB_BUS_ROUTES: DbBusRoute[] = [
  {
    id: "db-c4",
    number: "C4",
    name: "Coastline Villa ↺ DB North",
    nameZh: "碧濤軒 ↺ 愉景灣北",
    summary: "Circular via Plaza → Seabird → Greenvale/Neo Horizon → Chianti → DB North → Siena → Seabird return",
    fareHkd: 6.8,
    headwayMin: 12,
    featured: true,
    trackingMode: "eta-inferred",
    trackingNote:
      "DBTSL C4 — live stop ETAs from eta.dbtsl.com (same feed as Discovery Bay app). No vehicle GPS; map dots are ETA-inferred at the next stop.",
    stops: [
      s("c4-01", "Block 26, Coastline Villa", 22.29442, 114.02554),
      s("c4-02", "Blossom Court", 22.29577, 114.02451),
      s("c4-03", "Block 8, Coastline Villa", 22.29506, 114.02362),
      s("c4-04", "DB Community Green Square", 22.29413, 114.02283),
      s("c4-05", "Marina Drive, DB Road", 22.29468, 114.01945),
      s("c4-06", "DB Plaza Bus Terminus", 22.29574, 114.01726),
      s("c4-07", "Elegance Court", 22.29475, 114.01485),
      s("c4-08", "17 Seabird Lane", 22.29713, 114.01342),
      s("c4-09", "33 Seabird Lane", 22.29852, 114.01285),
      s("c4-10", "S.K.H. Wei Lun Primary School", 22.30017, 114.01195),
      s("c4-11", "Parkridge Village", 22.30231, 114.01083),
      s("c4-12", "Greenfield Court", 22.30399, 114.0102),
      s("c4-13", "Greenland Court", 22.30501, 114.00985),
      s("c4-14", "Greenmont Court", 22.30634, 114.00968),
      s("c4-15", "Neo Horizon", 22.30711, 114.00983),
      s("c4-16", "Graceful Mansion", 22.30802, 114.01105),
      s("c4-17", "Chianti Interchange", 22.30828, 114.01255),
      s("c4-18", "DB North Plaza", 22.30839, 114.01619),
      s("c4-19", "Block 58, Siena One", 22.30571, 114.01432),
      s("c4-20", "Block 20, Siena One", 22.30619, 114.01114),
      s("c4-21", "Block 2, Siena One", 22.30478, 114.01089),
      s("c4-22", "Parkridge Village", 22.30228, 114.01099),
      s("c4-23", "DB International School", 22.30115, 114.01159),
      s("c4-24", "39 Seabird Lane", 22.29918, 114.0126),
      s("c4-25", "25 Seabird Lane", 22.29779, 114.01324),
      s("c4-26", "13 Seabird Lane", 22.29692, 114.01365),
      s("c4-27", "DBRC Tennis Court", 22.29468, 114.01588),
      s("c4-28", "DB Plaza Bus Terminus", 22.29506, 114.01752),
      s("c4-29", "Costa Avenue, DB Road", 22.29473, 114.01985),
      s("c4-30", "Jovial Court", 22.2939, 114.02274),
      s("c4-31", "Capeland Drive, DB Road", 22.29523, 114.02366),
      s("c4-32", "Blossom Court", 22.29577, 114.02451),
      s("c4-33", "Block 26, Coastline Villa", 22.29442, 114.02554),
    ],
  },
  {
    id: "db-c9",
    number: "C9",
    name: "Crestmont Villa ↺ DB North",
    nameZh: "翠山灣 ↺ 愉景灣北",
    summary: "Circular paired with C4 via Plaza → Seabird → Siena Two → DB North → Chianti → Greenvale return",
    fareHkd: 6.8,
    headwayMin: 12,
    featured: true,
    trackingMode: "eta-inferred",
    trackingNote:
      "DBTSL C9 — live stop ETAs from eta.dbtsl.com (same feed as Discovery Bay app). No vehicle GPS; map dots are ETA-inferred at the next stop.",
    stops: [
      s("c9-01", "Block 41, Crestmont Villa", 22.29639, 114.0229),
      s("c9-02", "Block 25, Crestmont Villa", 22.29573, 114.02196),
      s("c9-03", "Block 5, Crestmont Villa", 22.29473, 114.02235),
      s("c9-04", "Marina Drive, DB Road", 22.29468, 114.01945),
      s("c9-05", "DB Plaza Bus Terminus", 22.29591, 114.01721),
      s("c9-06", "Elegance Court", 22.29475, 114.01485),
      s("c9-07", "17 Seabird Lane", 22.29713, 114.01342),
      s("c9-08", "33 Seabird Lane", 22.29852, 114.01285),
      s("c9-09", "S.K.H. Wei Lun Primary School", 22.30017, 114.01195),
      s("c9-10", "Parkridge Village", 22.30231, 114.01083),
      s("c9-11", "8 Siena Two", 22.30488, 114.01076),
      s("c9-12", "18 Siena Two", 22.30585, 114.01069),
      s("c9-13", "Club Siena", 22.30621, 114.01526),
      s("c9-14", "DB North Plaza", 22.30849, 114.016),
      s("c9-15", "Chianti Interchange", 22.30838, 114.01265),
      s("c9-16", "Graceful Mansion", 22.30795, 114.01133),
      s("c9-17", "Neo Horizon", 22.30745, 114.01018),
      s("c9-18", "Greenmont Court", 22.30633, 114.00978),
      s("c9-19", "Greenland Court", 22.30512, 114.00993),
      s("c9-20", "Greenfield Court", 22.30403, 114.01034),
      s("c9-21", "Parkridge Village", 22.30228, 114.01099),
      s("c9-22", "DB International School", 22.30115, 114.01159),
      s("c9-23", "39 Seabird Lane", 22.29918, 114.0126),
      s("c9-24", "25 Seabird Lane", 22.29779, 114.01324),
      s("c9-25", "13 Seabird Lane", 22.29692, 114.01365),
      s("c9-26", "DBRC Tennis Court", 22.29468, 114.01588),
      s("c9-27", "DB Plaza Bus Terminus", 22.29506, 114.01752),
      s("c9-28", "Costa Avenue, DB Road", 22.29473, 114.01985),
      s("c9-29", "Twilight Court", 22.29457, 114.02218),
      s("c9-30", "Block 16, Crestmont Villa", 22.29578, 114.02191),
      s("c9-31", "Block 26, Crestmont Villa", 22.29614, 114.02235),
      s("c9-32", "Block 32, Crestmont Villa", 22.29661, 114.02325),
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
