#!/usr/bin/env bun
/**
 * C4/C9 circular leg labels + due-ETA retention + no trip_code drops.
 * Run: bun scripts/test-circular-leg.mjs
 */
if (typeof process !== "undefined" && !process.versions?.bun) {
  console.error("Run with bun: bun scripts/test-circular-leg.mjs");
  process.exit(1);
}

const {
  circularLegLabel,
  circularLandmarkIndices,
} = await import("../src/lib/circularLeg.ts");
const {
  inferDbtslBusesOnRoad,
  nextStopsByTrip,
  resolveLiveDestinationLabel,
  formatActiveTripsStatus,
} = await import("../src/api/dbtslEta.ts");
const { separateOverlappingBusMarkers } = await import("../src/lib/liveBusUx.ts");

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("OK:", msg);
  }
}

/** C4 stop names matching eta.dbtsl.com order (33 stops). */
const c4Names = [
  "Block 26, Coastline Villa (DB01)",
  "Blossom Court (4B51)",
  "Block 8, Coastline Villa (DB02)",
  "DB Community Green Square (DB03)",
  "Marina Drive, DB Road (DB04)",
  "DB Plaza Bus Terminus (D1)",
  "Elegance Court (DB08)",
  "17 Seabird Lane (DB09)",
  "33 Seabird Lane (DB10)",
  "S.K.H. Wei Lun Primary School (DB11)",
  "Parkridge Village (DB12)",
  "Greenfield Court (DB13)",
  "Greenland Court (DB14)",
  "Greenmont Court (DB15)",
  "Neo Horizon (DB16)",
  "Graceful Mansion (DB17)",
  "Chianti Interchange (A1)",
  "DB North Plaza (C1)",
  "Block 58, Siena One (SA51)",
  "Block 20, Siena One (SA52)",
  "Block 2, Siena One (SA53)",
  "Parkridge Village (DB56)",
  "DB International School (DB57)",
  "39 Seabird Lane (DB58)",
  "25 Seabird Lane (DB59)",
  "13 Seabird Lane (DB60)",
  "DBRC Tennis Court (DB61)",
  "DB Plaza Bus Terminus (A)",
  "Costa Avenue, DB Road (DB65)",
  "Jovial Court (4E51)",
  "Capeland Drive, DB Road (DB67)",
  "Blossom Court (4B51)",
  "Block 26, Coastline Villa (DB01)",
];

const c9Names = [
  "No. 41, Caperidge Drive (4A51)",
  "No. 25, Caperidge Drive (4A52)",
  "No. 5, Caperidge Drive (4D51)",
  "Marina Drive, DB Road (DB04)",
  "DB Plaza Bus Terminus (D1)",
  "Elegance Court (DB08)",
  "17 Seabird Lane (DB09)",
  "33 Seabird Lane (DB10)",
  "S.K.H. Wei Lun Primary School (DB11)",
  "Parkridge Village (DB12)",
  "8 Siena Two (SA01)",
  "18 Siena Two (SA02)",
  "Club Siena (SA03)",
  "DB North Plaza (A1)",
  "Chianti Interchange (A2)",
  "Graceful Mansion (DB51)",
  "Neo Horizon (DB52)",
  "Greenmont Court (DB53)",
  "Greenland Court (DB54)",
  "Greenfield Court (DB55)",
  "Parkridge Village (DB56)",
  "DB International School (DB57)",
  "39 Seabird Lane (DB58)",
  "25 Seabird Lane (DB59)",
  "13 Seabird Lane (DB60)",
  "DBRC Tennis Court (DB61)",
  "DB Plaza Bus Terminus (A)",
  "Costa Avenue, DB Road (DB65)",
  "Twilight Court (4D01)",
  "No. 16, Caperidge Drive (4A01)",
  "No. 26, Caperidge Drive (4A02)",
  "No. 32, Caperidge Drive (4A03)",
];

const c4Stops = c4Names.map((stop, i) => ({
  stop,
  info: [],
  time: [],
  trip_code: [],
  latitude: 22.29 + i * 0.0001,
  longitude: 114.01 + i * 0.0001,
  people_cnt: 0,
}));
const c9Stops = c9Names.map((stop, i) => ({
  stop,
  info: [],
  time: [],
  trip_code: [],
  latitude: 22.29 + i * 0.0001,
  longitude: 114.01 + i * 0.0001,
  people_cnt: 0,
}));

// C4: Coastline start → Marina → Plaza D1 → Plaza
assert(circularLegLabel("C4", c4Stops, 0) === "Plaza", "C4 idx0 Coastline start → Plaza");
assert(circularLegLabel("C4", c4Stops, 4) === "Plaza", "C4 Marina → Plaza");
assert(circularLegLabel("C4", c4Stops, 5) === "Plaza", "C4 next Plaza D1 → Plaza");

// C4: Plaza D1 → Seabird → Greenmont → North → North Plaza
assert(circularLegLabel("C4", c4Stops, 6) === "North Plaza", "C4 Elegance → North Plaza");
assert(circularLegLabel("C4", c4Stops, 7) === "North Plaza", "C4 Seabird → North Plaza");
assert(circularLegLabel("C4", c4Stops, 13) === "North Plaza", "C4 Greenmont → North Plaza");
assert(circularLegLabel("C4", c4Stops, 17) === "North Plaza", "C4 at North → North Plaza");

// C4: Plaza A → Costa → Jovial → Capeland → Blossom → Coastline → Coastline
assert(circularLegLabel("C4", c4Stops, 18) === "Coastline", "C4 Siena return → Coastline");
assert(circularLegLabel("C4", c4Stops, 27) === "Coastline", "C4 Plaza A → Coastline");
assert(circularLegLabel("C4", c4Stops, 28) === "Coastline", "C4 Costa → Coastline");
assert(circularLegLabel("C4", c4Stops, 29) === "Coastline", "C4 Jovial → Coastline");
assert(circularLegLabel("C4", c4Stops, 30) === "Coastline", "C4 Capeland → Coastline");
assert(circularLegLabel("C4", c4Stops, 31) === "Coastline", "C4 Blossom late → Coastline");
assert(circularLegLabel("C4", c4Stops, 32) === "Coastline", "C4 Coastline end → Coastline");

// C9: Caperidge start → Plaza
assert(circularLegLabel("C9", c9Stops, 0) === "Plaza", "C9 Caperidge start → Plaza");
assert(circularLegLabel("C9", c9Stops, 3) === "Plaza", "C9 Marina → Plaza");

// C9: outbound Seabird / Siena Two → North Plaza (user live case)
assert(circularLegLabel("C9", c9Stops, 7) === "North Plaza", "C9 Seabird → North Plaza");
assert(circularLegLabel("C9", c9Stops, 10) === "North Plaza", "C9 Siena Two → North Plaza");
assert(circularLegLabel("C9", c9Stops, 13) === "North Plaza", "C9 at North → North Plaza");

// C9: Plaza A → Costa → Twilight → Caperidge → Crestmont
assert(circularLegLabel("C9", c9Stops, 26) === "Crestmont", "C9 Plaza A → Crestmont");
assert(circularLegLabel("C9", c9Stops, 27) === "Crestmont", "C9 Costa → Crestmont");
assert(circularLegLabel("C9", c9Stops, 28) === "Crestmont", "C9 Twilight → Crestmont");
assert(circularLegLabel("C9", c9Stops, 29) === "Crestmont", "C9 Caperidge late → Crestmont");

assert(circularLegLabel("6", c4Stops, 0) === null, "non-circular returns null");

const marks = circularLandmarkIndices("C4", c4Names);
assert(marks.plazaOut === 5 && marks.north === 17 && marks.plazaReturn === 27, `C4 landmarks ${JSON.stringify(marks)}`);

// --- Live inference: VV2879-class C4 on Coastline leg always rendered + labeled ---
const now = Date.now();
const tripCoast = "2026-09-26_VV2879_C4_DB Circle_1) Normal Route_1200";
const tripNorth = "2026-09-26_VU4770_C4_DB Circle_1) Normal Route_1203";

function stamp(stops, index, trip, minutesFromNow) {
  const s = stops[index];
  s.trip_code = [...s.trip_code, trip];
  s.time = [...s.time, new Date(now + minutesFromNow * 60_000).toISOString()];
  s.info = [...s.info, "x"];
}

const liveC4 = c4Names.map((stop, i) => ({
  stop,
  info: [],
  time: [],
  trip_code: [],
  latitude: 22.29 + i * 0.0004,
  longitude: 114.01 + i * 0.0003,
  people_cnt: 0,
}));

// Coastline-bound: next Jovial in 2 min (and due Blossom at -1 min retained)
stamp(liveC4, 29, tripCoast, 2);
stamp(liveC4, 30, tripCoast, 4);
stamp(liveC4, 31, tripCoast, 5);
stamp(liveC4, 32, tripCoast, 6);
// Also plant a just-due ETA at Jovial sibling to prove (-2,0] kept
stamp(liveC4, 28, tripCoast, -1);

// North-bound: next Seabird
stamp(liveC4, 7, tripNorth, 3);
stamp(liveC4, 17, tripNorth, 12);

const road = liveC4.map((s) => ({ lat: s.latitude, lng: s.longitude }));
const buses = inferDbtslBusesOnRoad(liveC4, road, { destinationLabel: "DB Circle" });
assert(buses.length === 2, `infer keeps 2 trips, got ${buses.length}`);
assert(
  buses.every((b) => b.id.includes("VV2879") || b.id.includes("VU4770")),
  "both trip_codes present",
);

const coastBus = buses.find((b) => b.plate === "VV2879");
const northBus = buses.find((b) => b.plate === "VU4770");
assert(coastBus?.destinationLabel === "Coastline", `VV2879 → Coastline (got ${coastBus?.destinationLabel})`);
assert(northBus?.destinationLabel === "North Plaza", `VU4770 → North Plaza (got ${northBus?.destinationLabel})`);

// Due ETA (-1) must not drop the trip; next stop should prefer earliest index with mins=0
const byTrip = nextStopsByTrip(liveC4);
const coastHit = byTrip.get(tripCoast);
assert(!!coastHit, "VV2879 retained with due ETA in (-2,0]");
assert(coastHit.stopIndex === 28, `due Costa (-1→0) wins as next, got idx ${coastHit?.stopIndex}`);

const status = formatActiveTripsStatus(buses);
assert(/Coastline/.test(status) && /North Plaza/.test(status), `status legs: ${status}`);
assert(!/DB Circle/.test(status), "status does not say DB Circle");

// Overlap must never drop a trip_code
const overlapped = buses.map((b) => ({ ...b, lat: buses[0].lat, lng: buses[0].lng }));
const separated = separateOverlappingBusMarkers(overlapped, road);
assert(separated.length === 2, "separateOverlappingBusMarkers keeps 2");
assert(
  separated.some((b) => b.plate === "VV2879") && separated.some((b) => b.plate === "VU4770"),
  "overlap offset keeps both plates",
);

// C9 Seabird → North Plaza via resolveLiveDestinationLabel
const leg = resolveLiveDestinationLabel(c9Stops, "2026-09-26_VR1689_C9_DB Circle_1) Normal Route_1136", 7, "DB Circle");
assert(leg === "North Plaza", `resolve C9 Seabird → North Plaza (got ${leg})`);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll circular-leg assertions passed.");
