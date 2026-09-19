#!/usr/bin/env bun
/**
 * Requires Bun (imports TypeScript from src/). Node cannot run this file.
 * Prefer: bun run test:qa
 */
if (typeof process !== "undefined" && !process.versions?.bun) {
  console.error("Run with bun (not node): bun scripts/test-two-trip-codes.mjs");
  console.error("Or: bun run test:qa");
  process.exit(1);
}

const { inferDbtslBusesOnRoad } = await import("../src/api/dbtslEta.ts");
const { listActiveTrips } = await import("../src/lib/dbSuggest.ts");
const { buildBusColumns, C9_BOARD } = await import("../src/lib/busColumnBoard.ts");
const { separateOverlappingBusMarkers } = await import("../src/lib/liveBusUx.ts");
const { formatLiveBusCount, detectTimetableLiveGap } = await import("../src/lib/liveBusUx.ts");

/**
 * Sanity: two synthetic trip_codes in stop ETA arrays →
 * inferDbtslBusesOnRoad / listActiveTrips / buildBusColumns all length 2.
 * We must never drop a trip_code when the feed has two.
 *
 * Run: bun scripts/test-two-trip-codes.mjs
 */

const now = Date.now();
const t1 = new Date(now + 3 * 60_000).toISOString();
const t2 = new Date(now + 8 * 60_000).toISOString();

const tripA = "2026-09-19_VR1696_C9_DB Circle_1) Normal Route_1000";
const tripB = "2026-09-19_VV2879_C9_DB Circle_1) Normal Route_1012";

const stops = [
  {
    stop: "Crestmont Villa",
    info: ["", ""],
    time: [t1, t2],
    trip_code: [tripA, tripB],
    latitude: 22.2915,
    longitude: 114.0175,
    people_cnt: 0,
  },
  {
    stop: "DB Plaza Bus Terminus",
    info: ["", ""],
    time: [
      new Date(now + 10 * 60_000).toISOString(),
      new Date(now + 15 * 60_000).toISOString(),
    ],
    trip_code: [tripA, tripB],
    latitude: 22.2957,
    longitude: 114.0173,
    people_cnt: 0,
  },
  {
    stop: "DB North Plaza",
    info: ["", ""],
    time: [
      new Date(now + 18 * 60_000).toISOString(),
      new Date(now + 23 * 60_000).toISOString(),
    ],
    trip_code: [tripA, tripB],
    latitude: 22.3084,
    longitude: 114.0162,
    people_cnt: 0,
  },
];

const road = stops.map((s) => ({ lat: s.latitude, lng: s.longitude }));

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("OK:", msg);
  }
}

const buses = inferDbtslBusesOnRoad(stops, road);
assert(buses.length === 2, `inferDbtslBusesOnRoad length ${buses.length} === 2`);
assert(
  buses.some((b) => b.plate === "VR1696") && buses.some((b) => b.plate === "VV2879"),
  "both plates present",
);

const trips = listActiveTrips(stops);
assert(trips.length === 2, `listActiveTrips length ${trips.length} === 2`);

const cols = buildBusColumns(stops, C9_BOARD);
assert(cols.length === 2, `buildBusColumns length ${cols.length} === 2`);

const countLine = formatLiveBusCount(buses);
assert(
  countLine.includes("2 buses") && countLine.includes("VR1696") && countLine.includes("VV2879"),
  `formatLiveBusCount: ${countLine}`,
);

// Overlap: force both at same coords → offset keeps 2, separates distance
const overlapped = [
  { ...buses[0], lat: 22.2957, lng: 114.0173 },
  { ...buses[1], lat: 22.2957, lng: 114.0173 },
];
const separated = separateOverlappingBusMarkers(overlapped, [
  { lat: 22.2915, lng: 114.0175 },
  { lat: 22.2957, lng: 114.0173 },
  { lat: 22.3084, lng: 114.0162 },
]);
assert(separated.length === 2, "overlap offset keeps 2 buses");
const dlat = Math.abs(separated[0].lat - separated[1].lat);
const dlng = Math.abs(separated[0].lng - separated[1].lng);
assert(dlat > 0 || dlng > 0, "overlap offset moved one marker");

// Gap note: 1 live + timetable slot nearby
const gap = detectTimetableLiveGap({
  liveTripCount: 1,
  schedule: {
    routeNumber: "C9",
    fromStopId: "plaza",
    fromLabel: "Plaza",
    stop: "DB Plaza Bus Terminus",
    endPoint: "DB Circle",
    published: true,
    originNote: null,
    dayType: "sat",
    dayLabel: "Sat",
    times: ["10:00", "10:12", "10:24"],
    byHour: [],
  },
  nextDepartures: [
    {
      time: "10:12",
      minutesFromNow: 6,
      tomorrow: false,
      dayType: "sat",
      dayLabel: "Sat",
    },
  ],
  headwayMin: 12,
  now: new Date(),
});
assert(!!gap && /DB Plaza Bus Terminus/.test(gap.note) && /10:12/.test(gap.note), `gap note: ${gap?.note}`);
assert(!/fake/i.test(gap.note), "gap note does not invent a fake bus");

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll two-trip-code sanity assertions passed.");
