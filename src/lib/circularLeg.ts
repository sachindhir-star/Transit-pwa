/**
 * Circular C4/C9 live leg labels.
 *
 * API destination is always "DB Circle", which is useless on the map.
 * Infer the active half-loop from the trip's next-stop index + stop names:
 *   C4 → Coastline | Plaza | North Plaza
 *   C9 → Crestmont | Plaza | North Plaza
 *
 * Name scan is primary; indices only break ties (feed order can shift slightly).
 */

export type CircularRoute = "C4" | "C9";

function isNorthPlaza(name: string): boolean {
  return /north plaza|db north plaza/i.test(name);
}

/** Main Plaza terminus (D1 outbound or A return) — not North Plaza. */
function isMainPlaza(name: string): boolean {
  if (isNorthPlaza(name)) return false;
  return /plaza bus terminus|db plaza|main plaza/i.test(name);
}

function isPlazaOutbound(name: string): boolean {
  return isMainPlaza(name) && /\(D1\)|\bD1\b/i.test(name);
}

function isPlazaReturn(name: string): boolean {
  // Return bay is labeled "(A)" on C4/C9 feeds — avoid bare \bA\b (matches "Plaza").
  return isMainPlaza(name) && /\(A\)/i.test(name);
}

function isCoastline(name: string): boolean {
  return /coastline/i.test(name);
}

function isCrestmontVillage(name: string): boolean {
  return /(crestmont|caperidge)/i.test(name);
}

function villageRe(route: CircularRoute): RegExp {
  return route === "C4" ? /coastline/i : /(crestmont|caperidge)/i;
}

function villageLabel(route: CircularRoute): string {
  return route === "C4" ? "Coastline" : "Crestmont";
}

/** Landmark indices along the full stop list (first / second main plaza, north, late village). */
export function circularLandmarkIndices(
  route: CircularRoute,
  stopNames: string[],
): {
  plazaOut: number;
  plazaReturn: number;
  north: number;
  villageLate: number;
} {
  let plazaOut = -1;
  let plazaReturn = -1;
  let north = -1;
  let villageLate = -1;
  const vRe = villageRe(route);

  for (let i = 0; i < stopNames.length; i++) {
    const n = stopNames[i] ?? "";
    if (north < 0 && isNorthPlaza(n)) north = i;
    if (isPlazaOutbound(n) && plazaOut < 0) plazaOut = i;
    else if (isMainPlaza(n) && !isNorthPlaza(n)) {
      if (plazaOut < 0) plazaOut = i;
      else if (plazaReturn < 0 && i > plazaOut) plazaReturn = i;
    }
    if (isPlazaReturn(n) && plazaReturn < 0) plazaReturn = i;
  }

  // Late village = first village stop after North (return half), else last village.
  if (north >= 0) {
    for (let i = north + 1; i < stopNames.length; i++) {
      if (vRe.test(stopNames[i] ?? "")) {
        villageLate = i;
        break;
      }
    }
  }
  if (villageLate < 0) {
    for (let i = stopNames.length - 1; i >= 0; i--) {
      if (vRe.test(stopNames[i] ?? "")) {
        villageLate = i;
        break;
      }
    }
  }

  return { plazaOut, plazaReturn, north, villageLate };
}

/**
 * Next major landmark on the active C4/C9 leg for a live trip.
 * Returns null for non-circular routes.
 */
export function circularLegLabel(
  routeNumber: string,
  stops: Array<{ stop: string }>,
  nextStopIndex: number,
): string | null {
  const route = routeNumber.trim().toUpperCase();
  if (route !== "C4" && route !== "C9") return null;
  if (!stops.length) return null;

  const names = stops.map((s) => s.stop);
  const idx = Math.max(0, Math.min(nextStopIndex, names.length - 1));
  const marks = circularLandmarkIndices(route as CircularRoute, names);
  const vLabel = villageLabel(route as CircularRoute);
  const vRe = villageRe(route as CircularRoute);

  // Primary: scan forward from next stop for the first defining landmark.
  for (let i = idx; i < names.length; i++) {
    const n = names[i] ?? "";
    if (isNorthPlaza(n)) return "North Plaza";
    if (isPlazaOutbound(n) || (isMainPlaza(n) && !isPlazaReturn(n) && marks.plazaOut === i)) {
      return "Plaza";
    }
    if (isPlazaReturn(n) || (marks.plazaReturn === i && isMainPlaza(n))) {
      // Return Plaza sits on the village-bound half (Plaza A → Costa → … → village).
      return vLabel;
    }
    // Village names only count as the leg destination on the late (post-North) half.
    if (vRe.test(n) && marks.north >= 0 && i > marks.north) {
      return vLabel;
    }
  }

  // Tie-break / fallback from landmark indices when name scan found nothing ahead
  // (e.g. next index past last named landmark).
  if (marks.north >= 0 && idx <= marks.north && (marks.plazaOut < 0 || idx > marks.plazaOut)) {
    return "North Plaza";
  }
  if (marks.plazaOut >= 0 && idx <= marks.plazaOut) {
    return "Plaza";
  }
  if (
    (marks.plazaReturn >= 0 && idx >= marks.plazaReturn) ||
    (marks.north >= 0 && idx > marks.north) ||
    (marks.villageLate >= 0 && idx >= marks.villageLate)
  ) {
    return vLabel;
  }

  // Early village / Marina before first Plaza — still Plaza-bound.
  if (marks.plazaOut >= 0) return "Plaza";
  if (isCoastline(names[idx] ?? "") || isCrestmontVillage(names[idx] ?? "")) {
    return "Plaza";
  }
  return vLabel;
}

/** True when API / short dest label is the useless circular umbrella. */
export function isCircularDbDest(destinationOrLabel: string | undefined | null): boolean {
  if (!destinationOrLabel) return false;
  return /db\s*circle|circle/i.test(destinationOrLabel.trim());
}
