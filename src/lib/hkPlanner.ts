import { ensureCtbIndex, findCtbDirectLegs } from "../api/ctbIndex";
import { ensureKmbIndex, findKmbDirectLegs } from "../api/kmbIndex";
import { planTrips as planCurated } from "../data/corridors";
import { TRANSFER_HUBS } from "../data/transferHubs";
import { dbFerrySeaShape, FERRY_SEA_CORRIDOR_NOTE } from "../data/dbFerrySeaPath";
import type { Place, StopPoint, TripLeg, TripOption } from "../types";
import {
  estimateBusFareHkd,
  estimateRideMin,
  haversineKm,
  haversineM,
  walkMinFromM,
} from "./geo";

const FERRY_FARE = 54.7;
const DB_EXTERNAL = 12.8;

function sp(
  id: string,
  name: string,
  lat: number,
  lng: number,
  extra?: Partial<StopPoint>,
): StopPoint {
  return { id, name, lat, lng, ...extra };
}

function placeStop(p: Place, label?: string): StopPoint {
  return sp(p.id, label ?? p.name, p.lat, p.lng, { nameZh: p.nameZh });
}

function isDbPlace(p: Place): boolean {
  if (p.area === "DB") return true;
  const id = p.id.toLowerCase();
  if (id.startsWith("db-") || id.includes("discovery-bay") || id.includes("愉景灣"))
    return true;
  // Geocoded DB: near plaza
  return haversineM(p, { lat: 22.2972, lng: 114.0165 }) < 2500;
}

function walkLeg(
  from: StopPoint,
  to: StopPoint,
  notes?: string,
): TripLeg {
  const m = haversineM(from, to);
  return {
    mode: "WALK",
    fromStop: from,
    toStop: to,
    shape: [from, to],
    durationMin: walkMinFromM(m),
    fareHkd: 0,
    notes,
    trackingMode: "walk",
  };
}

function ctbLegFromDirect(
  d: ReturnType<typeof findCtbDirectLegs>[0],
): TripLeg {
  const km = haversineKm(d.fromStop, d.toStop);
  const durationMin = estimateRideMin(d.stopHops, km);
  const fareHkd = estimateBusFareHkd(d.fromStop, d.toStop);
  return {
    mode: "CTB",
    route: d.route,
    routeName: `Citybus ${d.route} → ${d.destLabel}`,
    direction: d.direction,
    fromStop: d.fromStop,
    toStop: d.toStop,
    shape: [d.fromStop, d.toStop],
    durationMin,
    fareHkd,
    notes: `Board ${d.fromStop.name} → alight ${d.toStop.name}. Live ETA when available.`,
    eta: {
      operator: "CTB",
      stopId: d.fromStop.operatorStopId || d.fromStop.id,
      route: d.route,
      dir: d.dir,
    },
    trackingMode: "live-eta",
  };
}

function kmbLegFromDirect(
  d: ReturnType<typeof findKmbDirectLegs>[0],
): TripLeg {
  const km = haversineKm(d.fromStop, d.toStop);
  const durationMin = estimateRideMin(d.stopHops, km);
  const fareHkd = estimateBusFareHkd(d.fromStop, d.toStop);
  return {
    mode: "KMB",
    route: d.route,
    routeName: `KMB ${d.route}`,
    direction: d.direction,
    serviceType: d.serviceType,
    fromStop: d.fromStop,
    toStop: d.toStop,
    shape: [d.fromStop, d.toStop],
    durationMin,
    fareHkd,
    notes: `Board ${d.fromStop.name} → alight ${d.toStop.name}. Live ETA when available.`,
    eta: {
      operator: "KMB",
      stopId: d.fromStop.operatorStopId || d.fromStop.id,
      route: d.route,
      serviceType: d.serviceType,
    },
    trackingMode: "live-eta",
  };
}

function optionFromBusLegs(
  id: string,
  summary: string,
  legs: TripLeg[],
  tags: string[],
): TripOption {
  const totalMin = legs.reduce((s, l) => s + l.durationMin, 0);
  const totalFareHkd = legs.reduce((s, l) => s + (l.fareHkd ?? 0), 0);
  return { id, summary, totalMin, totalFareHkd, legs, tags };
}

function wrapWithWalks(
  origin: Place,
  dest: Place,
  bus: TripLeg,
  id: string,
  summary: string,
  tags: string[],
): TripOption {
  const legs: TripLeg[] = [];
  const walkFromM = haversineM(origin, bus.fromStop);
  if (walkFromM > 40) {
    legs.push(walkLeg(placeStop(origin), bus.fromStop, "Walk to boarding stop"));
  }
  legs.push(bus);
  const walkToM = haversineM(bus.toStop, dest);
  if (walkToM > 40) {
    legs.push(walkLeg(bus.toStop, placeStop(dest), "Walk to destination"));
  }
  return optionFromBusLegs(id, summary, legs, tags);
}

function findDirectBusOptions(from: Place, to: Place, limit = 5): TripOption[] {
  const ctb = findCtbDirectLegs(from, to, { maxMetres: 700, limit: 8 });
  const kmb = findKmbDirectLegs(from, to, { maxMetres: 700, limit: 8 });
  const opts: TripOption[] = [];

  for (const d of ctb) {
    const bus = ctbLegFromDirect(d);
    opts.push(
      wrapWithWalks(
        from,
        to,
        bus,
        `ctb-${d.route}-${d.dir}-${d.fromStop.id}-${d.toStop.id}`,
        `Citybus ${d.route} → ${d.destLabel}`,
        ["bus", "citybus", "live-eta", "open-data"],
      ),
    );
  }
  for (const d of kmb) {
    const bus = kmbLegFromDirect(d);
    opts.push(
      wrapWithWalks(
        from,
        to,
        bus,
        `kmb-${d.route}-${d.bound}-${d.fromStop.id}-${d.toStop.id}`,
        `KMB ${d.route}`,
        ["bus", "kmb", "live-eta", "open-data"],
      ),
    );
  }

  return opts.sort((a, b) => a.totalMin - b.totalMin || a.totalFareHkd - b.totalFareHkd).slice(0, limit);
}

function pickTransferHubs(from: Place, to: Place, max = 5): Place[] {
  const directKm = haversineKm(from, to);
  const scored = TRANSFER_HUBS.map((h) => {
    const via = haversineKm(from, h) + haversineKm(h, to);
    // Prefer hubs that don't detour too much
    const detour = via - directKm;
    return { h, detour, via };
  })
    .filter((x) => x.detour < Math.max(8, directKm * 0.85))
    .filter((x) => haversineM(from, x.h) > 600 && haversineM(to, x.h) > 600)
    .sort((a, b) => a.via - b.via);
  return scored.slice(0, max).map((x) => x.h);
}

function findTransferBusOptions(from: Place, to: Place, limit = 3): TripOption[] {
  const hubs = pickTransferHubs(from, to, 6);
  const out: TripOption[] = [];
  for (const hub of hubs) {
    const leg1opts = findDirectBusOptions(from, hub, 2);
    const leg2opts = findDirectBusOptions(hub, to, 2);
    if (!leg1opts.length || !leg2opts.length) continue;
    const a = leg1opts[0];
    const b = leg2opts[0];
    // Drop trailing walk of a and leading walk of b if both walk to/from same hub area
    const legs: TripLeg[] = [
      ...a.legs,
      walkLeg(placeStop(hub, `${hub.name} (transfer)`), placeStop(hub), "Transfer"),
      ...b.legs,
    ];
    // Simplify: remove zero-length transfer walk when same point
    const cleaned = legs.filter(
      (l) => !(l.mode === "WALK" && haversineM(l.fromStop, l.toStop) < 30),
    );
    const busRoutes = cleaned
      .filter((l) => l.mode === "CTB" || l.mode === "KMB")
      .map((l) => `${l.mode} ${l.route}`)
      .join(" + ");
    out.push(
      optionFromBusLegs(
        `xfer-${hub.id}-${a.id}-${b.id}`,
        `Via ${hub.name}: ${busRoutes}`,
        cleaned,
        ["bus", "transfer", "open-data"],
      ),
    );
    if (out.length >= limit) break;
  }
  return out.sort((a, b) => a.totalMin - b.totalMin).slice(0, limit);
}

function dbFerryLegsToCentral(): TripLeg[] {
  const plaza = placeStop(
    { id: "db-plaza", name: "DB Plaza", area: "DB", lat: 22.2972, lng: 114.0165 },
  );
  const pier = placeStop(
    { id: "db-ferry", name: "DB Ferry Pier", area: "DB", lat: 22.2963, lng: 114.0178 },
  );
  const central = placeStop(
    {
      id: "central-pier3",
      name: "Central Pier 3",
      area: "Island",
      lat: 22.2871,
      lng: 114.1606,
    },
  );
  return [
    walkLeg(plaza, pier, "Walk through DB Plaza to ferry pier"),
    {
      mode: "FERRY",
      route: "DB-Ferry",
      routeName: "DB ↔ Central Ferry",
      fromStop: pier,
      toStop: central,
      shape: dbFerrySeaShape(pier, central),
      durationMin: 30,
      fareHkd: FERRY_FARE,
      notes: FERRY_SEA_CORRIDOR_NOTE,
      trackingMode: "schedule",
    },
  ];
}

function buildDbToOutside(from: Place, to: Place): TripOption[] {
  const opts: TripOption[] = [];
  const ferryLegs = dbFerryLegsToCentral();
  const centralHub: Place = {
    id: "central-pier3",
    name: "Central Pier 3",
    area: "Island",
    lat: 22.2871,
    lng: 114.1606,
    kind: "pier",
  };
  const exchange: Place = {
    id: "exchange-square",
    name: "Exchange Square",
    area: "Island",
    lat: 22.2839,
    lng: 114.1585,
    kind: "bus",
  };

  // Primary: ferry only if destination is near Central piers
  if (haversineM(to, centralHub) < 450) {
    opts.push(
      optionFromBusLegs(
        "db-ferry-central",
        "Walk + DB Ferry → Central Pier 3",
        [
          ...ferryLegs,
          ...(haversineM(to, centralHub) > 80
            ? [walkLeg(ferryLegs[ferryLegs.length - 1].toStop, placeStop(to))]
            : []),
        ],
        ["ferry", "recommended", "schedule"],
      ),
    );
  } else {
    opts.push(
      optionFromBusLegs(
        "db-ferry-central-hub",
        "Walk + DB Ferry → Central Pier 3",
        ferryLegs,
        ["ferry", "recommended", "schedule"],
      ),
    );
  }

  // Ferry + connecting Citybus/KMB from Central / Exchange Square toward destination
  const fromHubs: Place[] = [centralHub, exchange, {
    id: "hub-admiralty",
    name: "Admiralty",
    area: "Island",
    lat: 22.2783,
    lng: 114.1647,
    kind: "mtr",
  }];
  const connectOpts: TripOption[] = [];
  for (const hub of fromHubs) {
    for (const busOpt of findDirectBusOptions(hub, to, 3)) {
      // Walk pier → hub if needed
      const pier = ferryLegs[ferryLegs.length - 1].toStop;
      const connect: TripLeg[] = [...ferryLegs];
      if (haversineM(pier, hub) > 80) {
        connect.push(walkLeg(pier, placeStop(hub), `Walk to ${hub.name} for bus`));
      }
      // Use first walk-to-bus + bus (+ final walk) from busOpt, skipping walk from hub if already there
      for (const leg of busOpt.legs) {
        if (leg.mode === "WALK" && haversineM(leg.fromStop, hub) < 120) continue;
        connect.push(leg);
      }
      const routes = connect
        .filter((l) => l.mode === "CTB" || l.mode === "KMB")
        .map((l) => `${l.mode === "CTB" ? "Citybus" : "KMB"} ${l.route}`)
        .join(", ");
      if (!routes) continue;
      connectOpts.push(
        optionFromBusLegs(
          `db-ferry-bus-${hub.id}-${busOpt.id}`,
          `DB Ferry → Central + ${routes} → ${to.name}`,
          connect,
          ["ferry", "bus", "live-eta", "open-data", "recommended"],
        ),
      );
    }
  }
  // Deduplicate by bus route set, keep shortest
  const seen = new Set<string>();
  for (const o of connectOpts.sort((a, b) => a.totalMin - b.totalMin)) {
    const key = o.legs
      .filter((l) => l.mode === "CTB" || l.mode === "KMB")
      .map((l) => `${l.mode}:${l.route}`)
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    opts.push(o);
    if (opts.filter((x) => x.tags?.includes("bus")).length >= 4) break;
  }

  // Backup: DB external bus → Tung Chung → open-data bus / MTR hint toward dest
  const tungChung: Place = {
    id: "tung-chung",
    name: "Tung Chung",
    area: "Lantau",
    lat: 22.2893,
    lng: 113.9411,
    kind: "mtr",
  };
  const dbBusLeg: TripLeg = {
    mode: "DB",
    route: "DB03R",
    routeName: "DB → Tung Chung (schedule)",
    fromStop: placeStop(from),
    toStop: placeStop(tungChung),
    shape: [placeStop(from), placeStop(tungChung)],
    durationMin: 40,
    fareHkd: DB_EXTERNAL,
    notes: "DBTSL external — confirm timetable. No open ETA API.",
    trackingMode: "schedule",
  };
  const afterTc = findDirectBusOptions(tungChung, to, 2);
  if (afterTc.length) {
    opts.push(
      optionFromBusLegs(
        `db-tc-bus-${afterTc[0].id}`,
        `DB bus → Tung Chung + ${afterTc[0].summary}`,
        [dbBusLeg, ...afterTc[0].legs],
        ["db-bus", "bus", "backup"],
      ),
    );
  } else {
    opts.push(
      optionFromBusLegs(
        "db-tc-mtr-hint",
        "DB bus → Tung Chung → MTR toward destination (hint)",
        [
          dbBusLeg,
          {
            mode: "MTR",
            route: "TCL+",
            routeName: "MTR from Tung Chung (connecting hint)",
            fromStop: placeStop(tungChung),
            toStop: placeStop(to),
            shape: [placeStop(tungChung), placeStop(to)],
            durationMin: Math.max(25, Math.round(haversineKm(tungChung, to) * 3)),
            fareHkd: 15.8,
            notes: "MTR connecting hint — not a live train tracker.",
            trackingMode: "mtr-hint",
          },
        ],
        ["db-bus", "mtr", "backup"],
      ),
    );
  }

  return opts;
}

function mtrHintOption(from: Place, to: Place): TripOption | null {
  const km = haversineKm(from, to);
  if (km < 0.6 || km > 45) return null;
  // Cheap heuristic fare
  let fare = 5.5;
  if (km > 5) fare = 8.5;
  if (km > 10) fare = 12.5;
  if (km > 18) fare = 18.5;
  const mins = Math.max(8, Math.round(km * 2.2 + 6));
  return {
    id: `mtr-hint-${from.id}-${to.id}`,
    summary: `MTR connecting hint → ${to.name}`,
    totalMin: mins,
    totalFareHkd: fare,
    legs: [
      {
        mode: "MTR",
        route: "MTR",
        routeName: "MTR (connecting hint)",
        fromStop: placeStop(from),
        toStop: placeStop(to),
        shape: [placeStop(from), placeStop(to)],
        durationMin: mins,
        fareHkd: fare,
        notes: "Typical ride-time estimate only — not a live train tracker or official journey plan.",
        trackingMode: "mtr-hint",
      },
    ],
    tags: ["mtr", "hint"],
  };
}

function dedupeOptions(opts: TripOption[]): TripOption[] {
  const seen = new Set<string>();
  const out: TripOption[] = [];
  for (const o of opts) {
    const key =
      o.tags?.includes("ferry") && !o.legs.some((l) => l.mode === "CTB" || l.mode === "KMB")
        ? `ferry:${o.summary}`
        : o.legs
            .map((l) => `${l.mode}:${l.route ?? ""}:${l.fromStop.id}:${l.toStop.id}`)
            .join(">");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}

/**
 * HK-wide trip planner: curated DB ferry corridors + open-data Citybus/KMB
 * stop-proximity route matching (+ 1-transfer hubs) + MTR hints.
 */
export async function planTripsAsync(from: Place, to: Place): Promise<TripOption[]> {
  if (from.id === to.id) return [];

  await Promise.all([ensureCtbIndex(), ensureKmbIndex()]);

  const curated = planCurated(from, to).filter((o) => !o.tags?.includes("fallback"));
  let options: TripOption[] = [];

  const fromDb = isDbPlace(from);
  const toDb = isDbPlace(to);

  if (fromDb && !toDb) {
    options = [...buildDbToOutside(from, to)];
    // Keep strong curated ferry variants
    for (const c of curated) {
      if (c.tags?.includes("ferry") || c.tags?.includes("db-bus")) options.push(c);
    }
  } else if (!fromDb && toDb) {
    // Reverse: open-data to Central + ferry home
    const central: Place = {
      id: "central-pier3",
      name: "Central Pier 3",
      area: "Island",
      lat: 22.2871,
      lng: 114.1606,
      kind: "pier",
    };
    const toCentral = findDirectBusOptions(from, central, 3);
    const ferryHome = planCurated(central, {
      id: "db-plaza",
      name: "DB Plaza",
      area: "DB",
      lat: 22.2972,
      lng: 114.0165,
    });
    for (const bus of toCentral) {
      for (const ferry of ferryHome.filter((f) => f.tags?.includes("ferry"))) {
        options.push(
          optionFromBusLegs(
            `to-db-${bus.id}-${ferry.id}`,
            `${bus.summary} + ferry to DB`,
            [...bus.legs, ...ferry.legs],
            ["ferry", "bus", "open-data"],
          ),
        );
      }
    }
    options.push(...curated);
    options.push(...findDirectBusOptions(from, to, 3));
  } else {
    // Entirely outside DB (or DB internal)
    options.push(...findDirectBusOptions(from, to, 6));
    if (options.length < 2) {
      options.push(...findTransferBusOptions(from, to, 3));
    } else {
      // Still offer one transfer alternative for awkward corridors
      options.push(...findTransferBusOptions(from, to, 1));
    }
    // Merge useful curated corridors (Central↔WC, Sunny Bay, etc.)
    for (const c of curated) {
      if (!c.tags?.includes("fallback")) options.push(c);
    }
    const mtr = mtrHintOption(from, to);
    if (mtr) options.push(mtr);
  }

  options = dedupeOptions(options).filter((o) => {
    const walkOnly = o.legs.length > 0 && o.legs.every((l) => l.mode === "WALK");
    if (!walkOnly) return true;
    const gap = Math.max(...o.legs.map((l) => haversineM(l.fromStop, l.toStop)));
    return gap <= 900; // drop curated "outside MVP" harbour walks
  });

  // Prefer live bus / ferry before vague hints; then by time
  const rank = (o: TripOption) => {
    const hasLive = o.legs.some((l) => l.trackingMode === "live-eta");
    const hasFerry = o.legs.some((l) => l.mode === "FERRY");
    const hasBus = o.legs.some((l) => l.mode === "CTB" || l.mode === "KMB");
    const walkOnly = o.legs.every((l) => l.mode === "WALK");
    const longWalkOnly =
      walkOnly &&
      o.legs.some((l) => haversineM(l.fromStop, l.toStop) > 900);
    const isMtrOnly = o.tags?.includes("mtr") && !hasLive && !hasBus;
    const isBackup = o.tags?.includes("backup");
    const isFallback = o.tags?.includes("fallback");
    const night = o.legs.some((l) => /^N\d/i.test(l.route ?? ""));
    let score = o.totalMin;
    if (hasLive) score -= 8;
    if (hasBus) score -= 6;
    if (hasFerry && fromDb) score -= 12;
    if (isMtrOnly) score += 15;
    if (isBackup) score += 25;
    if (isFallback) score += 50;
    if (longWalkOnly) score += 500; // never prefer cross-harbour / long walks
    if (night) score += 40;
    return score;
  };

  options.sort((a, b) => rank(a) - rank(b));

  // Never present a harbour-crossing / long walk as a "route". Prefer MTR hint;
  // only keep a short walk when places are genuinely close.
  if (!options.length) {
    const mtr = mtrHintOption(from, to);
    if (mtr) return [mtr];
    const gapM = haversineM(from, to);
    if (gapM <= 900) {
      return [
        {
          id: `walk-near-${from.id}-${to.id}`,
          summary: `Walk ${from.name} → ${to.name}`,
          totalMin: walkMinFromM(gapM),
          totalFareHkd: 0,
          legs: [
            walkLeg(
              placeStop(from),
              placeStop(to),
              "Short walk — no shared Citybus/KMB boarding pair found nearby.",
            ),
          ],
          tags: ["walk", "fallback"],
        },
      ];
    }
    return [
      {
        id: `empty-${from.id}-${to.id}`,
        summary: `No open-data bus match for ${from.name} → ${to.name}`,
        totalMin: Math.max(20, Math.round(haversineKm(from, to) * 3)),
        totalFareHkd: 0,
        legs: [
          {
            mode: "MTR",
            route: "—",
            routeName: "No matched Citybus/KMB corridor yet",
            fromStop: placeStop(from),
            toStop: placeStop(to),
            shape: [placeStop(from), placeStop(to)],
            durationMin: Math.max(20, Math.round(haversineKm(from, to) * 3)),
            fareHkd: 0,
            notes:
              "Open-data stop match found no shared Citybus/KMB route within walking range. Try a nearby hub (MTR / bus terminus) — not a walkable corridor.",
            trackingMode: "mtr-hint",
          },
        ],
        tags: ["fallback", "no-match"],
      },
    ];
  }

  return options.slice(0, 10);
}

/** Sync curated-only planner still used as fallback while async loads. */
export { planCurated };
