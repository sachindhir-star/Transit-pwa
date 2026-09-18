/**
 * Proves loop-route placement: a polyline that visits Plaza twice must place
 * "next = second Plaza visit" on the later pass, not snap to the first.
 *
 * Run: bun scripts/test-loop-placement.mjs
 */
import {
  nearestDistanceAlong,
  monotonicDistancesAlong,
  placeApproachingStop,
  placeApproachingStopByIndex,
  pointAtDistance,
} from "../src/lib/placeAlong.ts";

// Toy loop: Capridge → Plaza(N-bound) → North → Plaza(S-bound) → Costa → Capridge.
const PLAZA = { lat: 22.296, lng: 114.016 };
const NORTH = { lat: 22.3, lng: 114.016 };
const SOUTH = { lat: 22.292, lng: 114.016 };
const COSTA = { lat: 22.293, lng: 114.018 };
const CAPE = { lat: 22.291, lng: 114.017 };

const road = [
  CAPE,
  { lat: 22.292, lng: 114.0165 },
  SOUTH,
  { lat: 22.294, lng: 114.016 },
  PLAZA, // first visit (northbound)
  { lat: 22.298, lng: 114.016 },
  NORTH,
  { lat: 22.298, lng: 114.016 },
  { lat: 22.297, lng: 114.016 },
  { lat: 22.2965, lng: 114.016 },
  { lat: 22.2962, lng: 114.016 },
  { lat: 22.2961, lng: 114.016 },
  PLAZA, // second visit (southbound)
  { lat: 22.294, lng: 114.017 },
  COSTA,
  CAPE,
];

const stops = [
  CAPE, // 0
  SOUTH, // 1
  PLAZA, // 2 — first Plaza
  NORTH, // 3
  PLAZA, // 4 — second Plaza (bug target)
  COSTA, // 5
  CAPE, // 6
];

const geoFirst = nearestDistanceAlong(road, PLAZA);
const mono = monotonicDistancesAlong(road, stops);
const firstVisitAlong = mono[2];
const secondVisitAlong = mono[4];

console.log("Geographic nearest Plaza along:", geoFirst.toFixed(1), "m");
console.log("Monotonic Plaza#1 (stop 2):", firstVisitAlong.toFixed(1), "m");
console.log("Monotonic Plaza#2 (stop 4):", secondVisitAlong.toFixed(1), "m");

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("OK:", msg);
  }
}

assert(
  Math.abs(geoFirst - firstVisitAlong) < 30,
  "geographic nearest snaps to first Plaza pass",
);
assert(
  secondVisitAlong > firstVisitAlong + 50,
  `second Plaza visit further along (${secondVisitAlong.toFixed(0)} > ${firstVisitAlong.toFixed(0)})`,
);
assert(
  secondVisitAlong > geoFirst + 50,
  "next=second Plaza does NOT snap to first visit (monotonic)",
);

// Old API (geographic) wrongly places near first Plaza when given identical coords.
const oldPlace = placeApproachingStop(road, PLAZA, NORTH, 2);
const newPlace = placeApproachingStopByIndex(road, stops, 4, 2);
assert(!!oldPlace && !!newPlace, "both placers return a point");
assert(
  newPlace.distanceM > firstVisitAlong + 50,
  `ByIndex distanceM ${newPlace.distanceM.toFixed(0)} is past first Plaza`,
);
assert(
  oldPlace.distanceM < firstVisitAlong + 200,
  `legacy placer still near first pass (${oldPlace.distanceM.toFixed(0)}m) — documents the bug`,
);
assert(
  newPlace.distanceM > oldPlace.distanceM + 50,
  "ByIndex is further along than geographic placer for second Plaza",
);

// Position should be between North and second Plaza on the southbound leg.
const northPt = pointAtDistance(road, mono[3]);
assert(
  newPlace.lat < northPt.lat + 0.0005,
  "placed south of (or near) North Plaza on active leg",
);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll loop-placement assertions passed.");
