import type { Place, StopPoint, TripOption } from "../types";
import { dbFerrySeaShape, FERRY_SEA_CORRIDOR_NOTE } from "./dbFerrySeaPath";
import { getPlace, PLACES } from "./places";

const sp = (
  id: string,
  name: string,
  lat: number,
  lng: number,
  extra?: Partial<StopPoint>,
): StopPoint => ({ id, name, lat, lng, ...extra });

/** Approximate adult Octopus single fares (HKD) — labeled estimates. */
const F = {
  dbFerry: 54.7,
  dbInternal: 4.6,
  dbExternal: 12.8,
  islandShort: 5.8,
  crossHarbour: 12.1,
  eRoute: 14.0,
  aRoute: 33.0,
  mtrIsland: 5.5,
  mtrCross: 11.0,
  mtrTungChung: 15.8,
  walk: 0,
};

function placeStop(placeId: string, label?: string): StopPoint {
  const p = getPlace(placeId)!;
  return sp(placeId, label ?? p.name, p.lat, p.lng, { nameZh: p.nameZh });
}

/** Build DB Plaza → Central Pier via ferry (first-class). */
function dbToCentralFerry(): TripOption {
  const walkToPier = {
    mode: "WALK" as const,
    fromStop: placeStop("db-plaza"),
    toStop: placeStop("db-ferry"),
    shape: [placeStop("db-plaza"), placeStop("db-ferry")],
    durationMin: 6,
    fareHkd: F.walk,
    notes: "Walk through DB Plaza to ferry pier",
    trackingMode: "walk" as const,
  };
  const fromPier = placeStop("db-ferry");
  const toPier = placeStop("central-pier3");
  const ferry = {
    mode: "FERRY" as const,
    route: "DB-Ferry",
    routeName: "DB ↔ Central Ferry",
    fromStop: fromPier,
    toStop: toPier,
    shape: dbFerrySeaShape(fromPier, toPier),
    durationMin: 30,
    fareHkd: F.dbFerry,
    notes: FERRY_SEA_CORRIDOR_NOTE,
    trackingMode: "schedule" as const,
  };
  return {
    id: "db-central-ferry",
    summary: "Walk + DB Ferry → Central Pier 3",
    totalMin: 36,
    totalFareHkd: F.dbFerry,
    legs: [walkToPier, ferry],
    tags: ["ferry", "recommended", "schedule"],
  };
}

function centralToDbFerry(): TripOption {
  return {
    id: "central-db-ferry",
    summary: "Central Pier 3 → DB Ferry + walk to Plaza",
    totalMin: 36,
    totalFareHkd: F.dbFerry,
    legs: [
      (() => {
        const fromPier = placeStop("central-pier3");
        const toPier = placeStop("db-ferry");
        return {
          mode: "FERRY" as const,
          route: "DB-Ferry",
          routeName: "Central ↔ DB Ferry",
          fromStop: fromPier,
          toStop: toPier,
          shape: dbFerrySeaShape(fromPier, toPier),
          durationMin: 30,
          fareHkd: F.dbFerry,
          notes: FERRY_SEA_CORRIDOR_NOTE,
          trackingMode: "schedule" as const,
        };
      })(),
      {
        mode: "WALK",
        fromStop: placeStop("db-ferry"),
        toStop: placeStop("db-plaza"),
        shape: [placeStop("db-ferry"), placeStop("db-plaza")],
        durationMin: 6,
        fareHkd: 0,
        trackingMode: "walk",
      },
    ],
    tags: ["ferry", "recommended", "schedule"],
  };
}

function centralToWanChaiBus(): TripOption {
  return {
    id: "central-wc-ctb1",
    summary: "Citybus 1 / walk via harbourfront",
    totalMin: 18,
    totalFareHkd: F.islandShort,
    legs: [
      {
        mode: "CTB",
        route: "1",
        routeName: "Citybus 1",
        direction: "outbound",
        fromStop: sp("ctb-cen", "Central (Macao Ferry)", 22.28827, 114.15042, {
          operatorStopId: "001027",
        }),
        toStop: sp("ctb-wc", "O'Brien Road, Hennessy Road", 22.27769, 114.17313, {
          operatorStopId: "002431",
        }),
        shape: [
          sp("ctb1-001027", "Central (Macao Ferry)", 22.28827, 114.15042, { operatorStopId: "001027" }),
          sp("ctb1-001044", "Rumsey Street, Des Voeux Road Central", 22.28605, 114.15373, { operatorStopId: "001044" }),
          sp("ctb1-001173", "Hang Seng Bank HQ, Des Voeux Road Central", 22.28436, 114.15597, { operatorStopId: "001173" }),
          sp("ctb1-001049", "Douglas Street, Des Voeux Road Central", 22.28287, 114.15718, { operatorStopId: "001049" }),
          sp("ctb1-001050", "Alexandra House, Des Voeux Road Central", 22.28146, 114.1583, { operatorStopId: "001050" }),
          sp("ctb1-001052", "Chater Garden, Des Voeux Road Central", 22.28011, 114.16065, { operatorStopId: "001052" }),
          sp("ctb1-003845", "Admiralty - Queensway Plaza", 22.27849, 114.16448, { operatorStopId: "003845" }),
          sp("ctb1-002427", "Arsenal Street, Hennessy Road", 22.27785, 114.16894, { operatorStopId: "002427" }),
          sp("ctb1-002431", "O'Brien Road, Hennessy Road", 22.27769, 114.17313, { operatorStopId: "002431" }),
        ],
        durationMin: 15,
        fareHkd: F.islandShort,
        notes: "Citybus 1 outbound (Central Macao Ferry → Happy Valley). Live ETA from stop 001027.",
        eta: { operator: "CTB", stopId: "001027", route: "1", dir: "O" },
        trackingMode: "live-eta",
      },
    ],
    tags: ["bus", "live-eta"],
  };
}

function centralToWanChaiMtr(): TripOption {
  return {
    id: "central-wc-mtr",
    summary: "MTR Island Line (connecting hint)",
    totalMin: 10,
    totalFareHkd: F.mtrIsland,
    legs: [
      {
        mode: "WALK",
        fromStop: placeStop("central-mtr"),
        toStop: placeStop("central-mtr"),
        shape: [placeStop("central-mtr")],
        durationMin: 2,
        fareHkd: 0,
        notes: "Enter Central MTR",
        trackingMode: "walk",
      },
      {
        mode: "MTR",
        route: "ISL",
        routeName: "Island Line → Wan Chai",
        fromStop: placeStop("central-mtr"),
        toStop: placeStop("wan-chai"),
        shape: [placeStop("central-mtr"), placeStop("admiralty"), placeStop("wan-chai")],
        durationMin: 6,
        fareHkd: F.mtrIsland,
        notes: "MTR connecting hint — not a live train tracker.",
        trackingMode: "mtr-hint",
      },
    ],
    tags: ["mtr", "fast"],
  };
}

function wanChaiToCentralMtr(): TripOption {
  return {
    id: "wc-central-mtr",
    summary: "MTR Island Line → Central",
    totalMin: 10,
    totalFareHkd: F.mtrIsland,
    legs: [
      {
        mode: "MTR",
        route: "ISL",
        routeName: "Island Line → Central",
        fromStop: placeStop("wan-chai"),
        toStop: placeStop("central-mtr"),
        shape: [placeStop("wan-chai"), placeStop("admiralty"), placeStop("central-mtr")],
        durationMin: 8,
        fareHkd: F.mtrIsland,
        trackingMode: "mtr-hint",
      },
    ],
    tags: ["mtr", "fast"],
  };
}

function sunnyBayToMongKok(): TripOption[] {
  return [
    {
      id: "sunny-mk-mtr",
      summary: "MTR Tung Chung Line → Nam Cheong / transfer → Mong Kok",
      totalMin: 35,
      totalFareHkd: F.mtrTungChung,
      legs: [
        {
          mode: "MTR",
          route: "TCL",
          routeName: "Tung Chung Line",
          fromStop: placeStop("sunny-bay"),
          toStop: sp("nam-cheong", "Nam Cheong", 22.3246, 114.1537),
          shape: [
            placeStop("sunny-bay"),
            sp("tsing-yi", "Tsing Yi", 22.3583, 114.107),
            sp("nam-cheong", "Nam Cheong", 22.3246, 114.1537),
          ],
          durationMin: 18,
          fareHkd: F.mtrTungChung,
          notes: "Change at Nam Cheong or Olympic/Kowloon for Mong Kok area.",
          trackingMode: "mtr-hint",
        },
        {
          mode: "MTR",
          route: "TWL",
          routeName: "Transfer → Mong Kok",
          fromStop: sp("nam-cheong", "Nam Cheong", 22.3246, 114.1537),
          toStop: placeStop("mong-kok"),
          shape: [
            sp("nam-cheong", "Nam Cheong", 22.3246, 114.1537),
            placeStop("sham-shui-po"),
            placeStop("mong-kok"),
          ],
          durationMin: 12,
          fareHkd: 0,
          notes: "Included in Octopus journey fare estimate above.",
          trackingMode: "mtr-hint",
        },
      ],
      tags: ["mtr", "recommended"],
    },
    {
      id: "sunny-mk-e21",
      summary: "Citybus E21 corridor (via Tai Kok Tsui / Mong Kok west)",
      totalMin: 45,
      totalFareHkd: F.eRoute,
      legs: [
        {
          mode: "WALK",
          fromStop: placeStop("sunny-bay"),
          toStop: sp("sunny-bus", "Sunny Bay BBI / bus stop", 22.3318, 114.0295),
          shape: [placeStop("sunny-bay"), sp("sunny-bus", "Sunny Bay bus", 22.3318, 114.0295)],
          durationMin: 5,
          fareHkd: 0,
          trackingMode: "walk",
        },
        {
          mode: "CTB",
          route: "E21",
          routeName: "Citybus E21",
          direction: "outbound",
          fromStop: sp("e21-lantau", "Lantau Link / Airport corridor", 22.331, 114.03, {
            operatorStopId: "001603",
          }),
          toStop: sp("e21-tkt", "Tai Kok Tsui / Mong Kok west", 22.3215, 114.161),
          shape: [
            sp("s1", "Sunny Bay area", 22.331, 114.03),
            sp("s2", "Tsing Yi", 22.35, 114.11),
            sp("s3", "Olympic / Tai Kok Tsui", 22.318, 114.16),
            sp("s4", "Mong Kok west", 22.3215, 114.161),
          ],
          durationMin: 40,
          fareHkd: F.eRoute,
          notes: "E21 serves Tai Kok Tsui (Island Harbourview) — short walk to Mong Kok. Live ETA when available.",
          eta: { operator: "CTB", stopId: "001603", route: "E21" },
          trackingMode: "live-eta",
        },
      ],
      tags: ["bus", "live-eta"],
    },
  ];
}

function mongKokToSunnyBay(): TripOption[] {
  return [
    {
      id: "mk-sunny-mtr",
      summary: "MTR → Tung Chung Line → Sunny Bay",
      totalMin: 35,
      totalFareHkd: F.mtrTungChung,
      legs: [
        {
          mode: "MTR",
          route: "TWL+TCL",
          routeName: "To Nam Cheong / Tung Chung Line → Sunny Bay",
          fromStop: placeStop("mong-kok"),
          toStop: placeStop("sunny-bay"),
          shape: [
            placeStop("mong-kok"),
            placeStop("sham-shui-po"),
            sp("nam-cheong", "Nam Cheong", 22.3246, 114.1537),
            sp("tsing-yi", "Tsing Yi", 22.3583, 114.107),
            placeStop("sunny-bay"),
          ],
          durationMin: 35,
          fareHkd: F.mtrTungChung,
          trackingMode: "mtr-hint",
        },
      ],
      tags: ["mtr", "recommended"],
    },
  ];
}

function sunnyBayToSsp(): TripOption[] {
  return [
    {
      id: "sunny-ssp-mtr",
      summary: "MTR Tung Chung Line → Nam Cheong → Sham Shui Po",
      totalMin: 28,
      totalFareHkd: F.mtrTungChung,
      legs: [
        {
          mode: "MTR",
          route: "TCL",
          routeName: "Tung Chung Line + short transfer",
          fromStop: placeStop("sunny-bay"),
          toStop: placeStop("sham-shui-po"),
          shape: [
            placeStop("sunny-bay"),
            sp("tsing-yi", "Tsing Yi", 22.3583, 114.107),
            sp("nam-cheong", "Nam Cheong", 22.3246, 114.1537),
            placeStop("sham-shui-po"),
          ],
          durationMin: 28,
          fareHkd: F.mtrTungChung,
          trackingMode: "mtr-hint",
        },
      ],
      tags: ["mtr", "recommended"],
    },
  ];
}

function dbToTungChung(): TripOption[] {
  return [
    {
      id: "db-tc-db03",
      summary: "DB external bus toward Tung Chung (schedule)",
      totalMin: 40,
      totalFareHkd: F.dbExternal,
      legs: [
        {
          mode: "DB",
          route: "DB03R",
          routeName: "DB external (Tung Chung link — schedule)",
          fromStop: placeStop("db-plaza"),
          toStop: placeStop("tung-chung"),
          shape: [
            placeStop("db-plaza"),
            sp("db-tunnel", "DB tunnel / North Lantau", 22.31, 113.98),
            placeStop("tung-chung"),
          ],
          durationMin: 40,
          fareHkd: F.dbExternal,
          notes: "DBTSL external route — no open ETA API. Confirm timetable on hkdb / operator site.",
          trackingMode: "schedule",
        },
      ],
      tags: ["db-bus", "schedule"],
    },
    {
      id: "db-tc-ferry-mtr",
      summary: "Ferry → Central → MTR → Tung Chung (long but reliable)",
      totalMin: 95,
      totalFareHkd: F.dbFerry + F.mtrTungChung,
      legs: [
        ...dbToCentralFerry().legs,
        {
          mode: "MTR",
          route: "TCL",
          routeName: "Tung Chung Line from Hong Kong / Kowloon",
          fromStop: placeStop("central-mtr"),
          toStop: placeStop("tung-chung"),
          shape: [
            placeStop("central-mtr"),
            placeStop("sunny-bay"),
            placeStop("tung-chung"),
          ],
          durationMin: 35,
          fareHkd: F.mtrTungChung,
          trackingMode: "mtr-hint",
        },
      ],
      tags: ["ferry", "mtr"],
    },
  ];
}

function dbToAirport(): TripOption[] {
  return [
    {
      id: "db-airport-via-tc",
      summary: "DB bus → Tung Chung → Airport bus/AEL hint",
      totalMin: 55,
      totalFareHkd: F.dbExternal + 4,
      legs: [
        {
          mode: "DB",
          route: "DB03R",
          routeName: "DB → Tung Chung (schedule)",
          fromStop: placeStop("db-plaza"),
          toStop: placeStop("tung-chung"),
          shape: [placeStop("db-plaza"), placeStop("tung-chung")],
          durationMin: 40,
          fareHkd: F.dbExternal,
          trackingMode: "schedule",
        },
        {
          mode: "CTB",
          route: "S1",
          routeName: "Airport shuttle / connecting bus (check on day)",
          fromStop: placeStop("tung-chung"),
          toStop: placeStop("airport"),
          shape: [placeStop("tung-chung"), placeStop("airport")],
          durationMin: 15,
          fareHkd: 4,
          notes: "Confirm S1/E-routes on the day. Citybus A/E routes also serve Airport from Island/Kowloon.",
          trackingMode: "schedule",
        },
      ],
      tags: ["airport", "schedule"],
    },
  ];
}

function exchangeToWanChai(): TripOption[] {
  return [
    {
      id: "ex-wc-walk",
      summary: "Walk harbourfront / Citybus along Connaught–Hennessy",
      totalMin: 20,
      totalFareHkd: F.islandShort,
      legs: [
        {
          mode: "CTB",
          route: "5B",
          routeName: "Citybus 5B / island corridor",
          direction: "inbound",
          fromStop: placeStop("exchange-square"),
          toStop: placeStop("wan-chai"),
          shape: [
            placeStop("exchange-square"),
            placeStop("admiralty"),
            placeStop("wan-chai"),
          ],
          durationMin: 18,
          fareHkd: F.islandShort,
          eta: { operator: "CTB", stopId: "001152", route: "5B" },
          trackingMode: "live-eta",
        },
      ],
      tags: ["bus", "live-eta"],
    },
    centralToWanChaiMtr(),
  ];
}

function tstToCentral(): TripOption[] {
  return [
    {
      id: "tst-central-star",
      summary: "Star Ferry TST → Central (schedule)",
      totalMin: 15,
      totalFareHkd: 5,
      legs: [
        {
          mode: "FERRY",
          route: "Star-Ferry",
          routeName: "Star Ferry",
          fromStop: sp("tst-star", "TST Star Ferry Pier", 22.294, 114.1685),
          toStop: sp("cen-star", "Central Star Ferry Pier", 22.2865, 114.1608),
          shape: [
            sp("tst-star", "TST Star Ferry Pier", 22.294, 114.1685),
            sp("cen-star", "Central Star Ferry Pier", 22.2865, 114.1608),
          ],
          durationMin: 10,
          fareHkd: 5,
          notes: "Classic harbour crossing — schedule based.",
          trackingMode: "schedule",
        },
        {
          mode: "WALK",
          fromStop: sp("cen-star", "Central Star Ferry Pier", 22.2865, 114.1608),
          toStop: placeStop("central-mtr"),
          shape: [
            sp("cen-star", "Central Star Ferry Pier", 22.2865, 114.1608),
            placeStop("central-mtr"),
          ],
          durationMin: 5,
          fareHkd: 0,
          trackingMode: "walk",
        },
      ],
      tags: ["ferry", "scenic"],
    },
    {
      id: "tst-central-mtr",
      summary: "MTR Tsuen Wan Line → Central",
      totalMin: 12,
      totalFareHkd: F.mtrCross,
      legs: [
        {
          mode: "MTR",
          route: "TWL",
          routeName: "Tsuen Wan Line",
          fromStop: placeStop("tsim-sha-tsui"),
          toStop: placeStop("central-mtr"),
          shape: [
            placeStop("tsim-sha-tsui"),
            placeStop("admiralty"),
            placeStop("central-mtr"),
          ],
          durationMin: 10,
          fareHkd: F.mtrCross,
          trackingMode: "mtr-hint",
        },
      ],
      tags: ["mtr", "fast"],
    },
  ];
}

/** Pair key helper */
function pairKey(a: string, b: string) {
  return `${a}→${b}`;
}

const PAIR_BUILDERS: Record<string, () => TripOption[]> = {
  [pairKey("db-plaza", "central-pier3")]: () => [
    dbToCentralFerry(),
    {
      id: "db-central-via-tc",
      summary: "DB bus → Tung Chung → MTR → Central (backup)",
      totalMin: 85,
      totalFareHkd: F.dbExternal + F.mtrTungChung,
      legs: dbToTungChung()[0].legs.concat([
        {
          mode: "MTR",
          route: "TCL",
          routeName: "Tung Chung Line → Hong Kong / Central",
          fromStop: placeStop("tung-chung"),
          toStop: placeStop("central-mtr"),
          shape: [placeStop("tung-chung"), placeStop("sunny-bay"), placeStop("central-mtr")],
          durationMin: 35,
          fareHkd: F.mtrTungChung,
          trackingMode: "mtr-hint",
        },
      ]),
      tags: ["backup"],
    },
  ],
  [pairKey("db-ferry", "central-pier3")]: () => [dbToCentralFerry()],
  [pairKey("db-park", "central-pier3")]: () => [dbToCentralFerry()],
  [pairKey("db-plaza", "exchange-square")]: () => [
    {
      ...dbToCentralFerry(),
      id: "db-exchange",
      summary: "DB Ferry → Central Pier + walk to Exchange Square",
      totalMin: 42,
      legs: [
        ...dbToCentralFerry().legs,
        {
          mode: "WALK",
          fromStop: placeStop("central-pier3"),
          toStop: placeStop("exchange-square"),
          shape: [placeStop("central-pier3"), placeStop("exchange-square")],
          durationMin: 6,
          fareHkd: 0,
          notes: "Short walk from Pier 3 to Exchange Square bus terminus",
          trackingMode: "walk",
        },
      ],
    },
  ],
  [pairKey("central-pier3", "db-plaza")]: () => [centralToDbFerry()],
  [pairKey("central-pier3", "db-ferry")]: () => [centralToDbFerry()],
  [pairKey("exchange-square", "db-plaza")]: () => [
    {
      id: "ex-db",
      summary: "Walk to Pier 3 + ferry to DB",
      totalMin: 42,
      totalFareHkd: F.dbFerry,
      legs: [
        {
          mode: "WALK",
          fromStop: placeStop("exchange-square"),
          toStop: placeStop("central-pier3"),
          shape: [placeStop("exchange-square"), placeStop("central-pier3")],
          durationMin: 6,
          fareHkd: 0,
          trackingMode: "walk",
        },
        ...centralToDbFerry().legs,
      ],
      tags: ["ferry"],
    },
  ],
  [pairKey("central-mtr", "wan-chai")]: () => [centralToWanChaiMtr(), centralToWanChaiBus()],
  [pairKey("wan-chai", "central-mtr")]: () => [wanChaiToCentralMtr()],
  [pairKey("central-pier3", "wan-chai")]: () => [
    {
      id: "pier-wc",
      summary: "Walk / bus from Central piers to Wan Chai",
      totalMin: 22,
      totalFareHkd: F.islandShort,
      legs: [
        {
          mode: "WALK",
          fromStop: placeStop("central-pier3"),
          toStop: placeStop("exchange-square"),
          shape: [placeStop("central-pier3"), placeStop("exchange-square")],
          durationMin: 6,
          fareHkd: 0,
          trackingMode: "walk",
        },
        ...centralToWanChaiBus().legs,
      ],
      tags: ["bus"],
    },
    centralToWanChaiMtr(),
  ],
  [pairKey("sunny-bay", "mong-kok")]: sunnyBayToMongKok,
  [pairKey("mong-kok", "sunny-bay")]: mongKokToSunnyBay,
  [pairKey("sunny-bay", "sham-shui-po")]: sunnyBayToSsp,
  [pairKey("sham-shui-po", "sunny-bay")]: () => [
    {
      id: "ssp-sunny-mtr",
      summary: "MTR → Tung Chung Line → Sunny Bay",
      totalMin: 28,
      totalFareHkd: F.mtrTungChung,
      legs: [
        {
          mode: "MTR",
          route: "TCL",
          routeName: "To Sunny Bay",
          fromStop: placeStop("sham-shui-po"),
          toStop: placeStop("sunny-bay"),
          shape: [
            placeStop("sham-shui-po"),
            sp("nam-cheong", "Nam Cheong", 22.3246, 114.1537),
            placeStop("sunny-bay"),
          ],
          durationMin: 28,
          fareHkd: F.mtrTungChung,
          trackingMode: "mtr-hint",
        },
      ],
      tags: ["mtr"],
    },
  ],
  [pairKey("db-plaza", "tung-chung")]: dbToTungChung,
  [pairKey("db-plaza", "airport")]: dbToAirport,
  [pairKey("exchange-square", "wan-chai")]: exchangeToWanChai,
  [pairKey("tsim-sha-tsui", "central-mtr")]: tstToCentral,
};

/** Nearby place clusters for fuzzy corridor matching */
const CLUSTERS: Record<string, string[]> = {
  db: ["db-plaza", "db-ferry", "db-north", "db-park"],
  central: ["central-pier3", "exchange-square", "central-mtr", "admiralty", "ifc-mall", "sheung-wan"],
  wanchai: ["wan-chai", "exhibition", "causeway-bay"],
};

function clusterOf(id: string): string | null {
  for (const [k, ids] of Object.entries(CLUSTERS)) {
    if (ids.includes(id)) return k;
  }
  return null;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Snap geocoded places onto the nearest curated hub for corridor matching. */
function resolveHub(place: Place, maxKm = 2.5): Place {
  if (getPlace(place.id)) return place;
  let best: Place | null = null;
  let bestD = Infinity;
  for (const p of PLACES) {
    const d = haversineKm(place, p);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (best && bestD <= maxKm) return best;
  return place;
}

function asStop(place: Place, label?: string): StopPoint {
  return sp(place.id, label ?? place.name, place.lat, place.lng, { nameZh: place.nameZh });
}

export function planTrips(fromRaw: Place, toRaw: Place): TripOption[] {
  const from = resolveHub(fromRaw);
  const to = resolveHub(toRaw);
  if (fromRaw.id === toRaw.id) return [];

  if (from.id === to.id) {
    return [
      {
        id: `walk-${fromRaw.id}-${toRaw.id}`,
        summary: `Walk ${fromRaw.name} → ${toRaw.name}`,
        totalMin: 12,
        totalFareHkd: 0,
        legs: [
          {
            mode: "WALK",
            fromStop: asStop(fromRaw),
            toStop: asStop(toRaw),
            shape: [asStop(fromRaw), asStop(toRaw)],
            durationMin: 12,
            fareHkd: 0,
            notes: "Same corridor hub — short walk between searched places.",
            trackingMode: "walk",
          },
        ],
        tags: ["walk"],
      },
    ];
  }

  const direct = PAIR_BUILDERS[pairKey(from.id, to.id)];
  if (direct) return direct().sort((a, b) => a.totalMin - b.totalMin);

  // Cluster-level fallbacks
  const fc = clusterOf(from.id);
  const tc = clusterOf(to.id);
  if (fc === "db" && tc === "central") return PAIR_BUILDERS[pairKey("db-plaza", "central-pier3")]();
  if (fc === "central" && tc === "db") return PAIR_BUILDERS[pairKey("central-pier3", "db-plaza")]();
  if (fc === "central" && tc === "wanchai") return PAIR_BUILDERS[pairKey("central-mtr", "wan-chai")]();
  if (fc === "wanchai" && tc === "central") return PAIR_BUILDERS[pairKey("wan-chai", "central-mtr")]();

  // Outside curated pairs: do NOT invent a long walk (e.g. Island↔Kowloon).
  // HK-wide open-data matching in hkPlanner handles these; return empty here.
  const gapM = haversineKm(fromRaw, toRaw) * 1000;
  if (gapM <= 900) {
    const mins = Math.max(3, Math.round(gapM / 80));
    return [
      {
        id: `walk-${fromRaw.id}-${toRaw.id}`,
        summary: `Walk ${fromRaw.name} → ${toRaw.name}`,
        totalMin: mins,
        totalFareHkd: 0,
        legs: [
          {
            mode: "WALK",
            fromStop: asStop(fromRaw),
            toStop: asStop(toRaw),
            shape: [asStop(fromRaw), asStop(toRaw)],
            durationMin: mins,
            fareHkd: 0,
            notes: "Nearby places — short walk.",
            trackingMode: "walk",
          },
        ],
        tags: ["walk"],
      },
    ];
  }
  return [];
}
