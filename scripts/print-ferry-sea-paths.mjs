#!/usr/bin/env bun
/**
 * Requires Bun (imports TypeScript from src/). Node cannot run this file.
 * Prefer: bun run test:qa
 */
if (typeof process !== "undefined" && !process.versions?.bun) {
  console.error("Run with bun (not node): bun scripts/print-ferry-sea-paths.mjs");
  console.error("Or: bun run test:qa");
  process.exit(1);
}

const { DB_FERRY_SEA_WAYPOINTS, NSW_PENG_CHAU_SEA_WAYPOINTS, PENG_CHAU_MUI_WO_SEA_WAYPOINTS, NSW_MUI_WO_DIRECT_SEA_WAYPOINTS, kaitoSeaShape, dbFerrySeaShape } = await import("../src/data/dbFerrySeaPath.ts");

/**
 * Sanity print of ferry sea corridor polylines.
 * Flags any mid-corridor point that looks like the old NSW→Mui Wo land chord
 * (SW diagonal across Tai Shui Hang / Discovery Bay hills).
 */

const NSW = { id: "nim-shue-wan", name: "Nim Shue Wan", lat: 22.29322, lng: 114.02159 };
const PC = { id: "peng-chau-pier", name: "Peng Chau", lat: 22.287, lng: 114.0385 };
const MW = { id: "mui-wo-pier", name: "Mui Wo", lat: 22.2645, lng: 114.0015 };
const DB = { id: "db-ferry", name: "DB Ferry Pier", lat: 22.2963, lng: 114.0178 };
const CEN = { id: "central-pier3", name: "Central Pier 3", lat: 22.2871, lng: 114.1606 };

/** Rough Lantau land box between NSW and Mui Wo (the bug chord zone). */
function looksLikeLandChord(lat, lng) {
  // Interior of peninsula west of channel, north of Silver Mine Bay, south of NSW
  return lat > 22.266 && lat < 22.291 && lng > 114.002 && lng < 114.022;
}

function printCorridor(title, points) {
  console.log(`\n=== ${title} (${points.length} pts) ===`);
  let flags = 0;
  for (const p of points) {
    const land = looksLikeLandChord(p.lat, p.lng);
    if (land) flags++;
    console.log(
      `  ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}  ${land ? "⚠ LAND-BOX" : "ok"}  ${p.name || p.id}`,
    );
  }
  let midFail = false;
  // Mid-section of NSW-Mui Wo direct must keep lng high (east channel)
  if (/direct|mui wo/i.test(title)) {
    const mids = points.filter((p) => p.lat < 22.288 && p.lat > 22.27);
    if (mids.length) {
      const minLng = Math.min(...mids.map((p) => p.lng));
      console.log(`  mid-section min lng=${minLng.toFixed(4)} (want ≥ ~114.030)`);
      if (minLng < 114.03) midFail = true;
    }
  }
  const fail = flags > 0 || midFail;
  console.log(
    fail
      ? `  RESULT: ${flags} land-box / mid-lng FAIL`
      : "  RESULT: clear of land-box — OK",
  );
  return fail ? 1 : 0;
}

let failed = 0;
failed += printCorridor("DB ↔ Central waypoints", DB_FERRY_SEA_WAYPOINTS);
failed += printCorridor("NSW ↔ Peng Chau waypoints", NSW_PENG_CHAU_SEA_WAYPOINTS);
failed += printCorridor("Peng Chau ↔ Mui Wo waypoints", PENG_CHAU_MUI_WO_SEA_WAYPOINTS);
failed += printCorridor("NSW ↔ Mui Wo DIRECT waypoints", NSW_MUI_WO_DIRECT_SEA_WAYPOINTS);

failed += printCorridor(
  "kaitoSeaShape direct NSW→Mui Wo",
  kaitoSeaShape([NSW, MW], "direct"),
);
failed += printCorridor(
  "kaitoSeaShape via Peng Chau NSW→PC→Mui Wo",
  kaitoSeaShape([NSW, PC, MW], "via-peng-chau"),
);
failed += printCorridor("dbFerrySeaShape DB→Central", dbFerrySeaShape(DB, CEN));

if (failed) {
  console.error(`\n${failed} corridor(s) failed land/water checks`);
  process.exit(1);
}
console.log("\nAll ferry sea-path corridors clear.");
