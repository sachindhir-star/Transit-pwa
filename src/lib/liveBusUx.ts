/**
 * Honest live-feed UX: loud trip_code counts, timetable-vs-live gap notes,
 * and map marker de-overlap. Never invents a second bus/ETA.
 */
import type { LatLng } from "../api/roadGeometry";
import { parseTripCode } from "../api/dbtslEta";
import {
  formatScheduledClock,
  hkParts,
  type ScheduledDeparture,
  type TodaysSchedule,
} from "./dbtslTimetable";
import {
  distM,
  nearestDistanceAlong,
  pointAtDistance,
} from "./placeAlong";
import type { InferredBus } from "../types";

/** Plate from inferred bus id (`dbtsl-{trip_code}`) or label prefix. */
export function plateFromBus(bus: InferredBus): string {
  if (bus.plate) return bus.plate;
  if (bus.id.startsWith("dbtsl-")) {
    return parseTripCode(bus.id.slice("dbtsl-".length)).plate;
  }
  const head = bus.label.split("·")[0]?.trim();
  return head || "bus";
}

/**
 * Loud live count + plates for map/board headers.
 * e.g. `Live: 1 bus · VR1696` / `Live: 2 buses · VR1696, VV2879`
 * / `Live feed empty — timetable still shown`
 */
export function formatLiveBusCount(buses: InferredBus[]): string {
  const n = buses.length;
  if (n === 0) return "Live feed empty — timetable still shown";
  const plates = buses.map(plateFromBus);
  const unique = [...new Set(plates)];
  const noun = n === 1 ? "bus" : "buses";
  return `Live: ${n} ${noun} · ${unique.join(", ")}`;
}

/** Same wording for column boards that only have plates (no InferredBus[]). */
export function formatLivePlateCount(plates: string[]): string {
  const unique = [...new Set(plates.filter(Boolean))];
  const n = unique.length;
  if (n === 0) return "Live feed empty — timetable still shown";
  const noun = n === 1 ? "bus" : "buses";
  return `Live: ${n} ${noun} · ${unique.join(", ")}`;
}

export interface TimetableLiveGap {
  stop: string;
  clock: string;
  /** Full user-facing note (no fake map icon). */
  note: string;
}

function parseHhMmToMins(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  return h * 60 + mm;
}

/**
 * When live trip_codes are 0 or 1 but the published timetable has another
 * departure within ~1 headway that is not represented in the live feed,
 * return a clear note. Never places a fake bus.
 *
 * C4/C9 circular: headway often implies 2 buses can be out while the feed
 * only emits one trip_code — surface the missing timetable slot honestly.
 */
export function detectTimetableLiveGap(opts: {
  liveTripCount: number;
  schedule: TodaysSchedule | null;
  nextDepartures: ScheduledDeparture[];
  headwayMin: number;
  now?: Date;
}): TimetableLiveGap | null {
  const { liveTripCount, schedule, nextDepartures, headwayMin } = opts;
  if (!schedule) return null;
  if (liveTripCount >= 2) return null;

  const now = opts.now ?? new Date();
  const { minutesOfDay } = hkParts(now);
  const windowMin = Math.max(8, Math.round(headwayMin * 1.15));

  type Slot = { time: string; deltaMin: number };
  const nearby: Slot[] = [];
  for (const t of schedule.times) {
    const mins = parseHhMmToMins(t);
    if (mins == null) continue;
    const delta = mins - minutesOfDay;
    if (delta >= -windowMin && delta <= windowMin) {
      nearby.push({ time: t, deltaMin: delta });
    }
  }
  nearby.sort((a, b) => a.deltaMin - b.deltaMin);

  // Upcoming within window (preferred for “not in the live ETA feed yet”).
  const upcomingInWindow = nextDepartures.find(
    (d) => !d.tomorrow && d.minutesFromNow <= windowMin,
  );

  let picked: { time: string; clock: string } | null = null;

  if (liveTripCount === 0) {
    if (upcomingInWindow) {
      picked = {
        time: upcomingInWindow.time,
        clock: formatScheduledClock(upcomingInWindow),
      };
    } else if (nearby.length > 0) {
      // Most recent past slot in window — still not in the live feed.
      const past = [...nearby].reverse().find((s) => s.deltaMin <= 0);
      const slot = past ?? nearby[0];
      picked = { time: slot.time, clock: slot.time };
    }
  } else {
    // live === 1: need evidence of *another* published departure near now.
    if (nearby.length >= 2) {
      // Prefer a future slot; else the older of the two past slots.
      const future = nearby.find((s) => s.deltaMin > 0);
      const pastSlots = nearby.filter((s) => s.deltaMin <= 0);
      const slot =
        future ??
        (pastSlots.length >= 2 ? pastSlots[0] : pastSlots[0] ?? nearby[0]);
      picked = {
        time: slot.time,
        clock: future ? formatScheduledClock({
          time: slot.time,
          minutesFromNow: slot.deltaMin,
          tomorrow: false,
          dayType: schedule.dayType,
          dayLabel: schedule.dayLabel,
        }) : slot.time,
      };
    } else if (upcomingInWindow && nearby.length <= 1) {
      // One live bus out + next timetable departure due within ~1 headway —
      // that next departure is not yet a live trip_code.
      picked = {
        time: upcomingInWindow.time,
        clock: formatScheduledClock(upcomingInWindow),
      };
    }
  }

  if (!picked) return null;

  const stop = schedule.stop;
  return {
    stop,
    clock: picked.clock,
    note: `Timetable also has a departure from ${stop} at ${picked.clock} — not in the live ETA feed yet, so no second map icon (we only draw trip_codes from eta.dbtsl.com).`,
  };
}

const OVERLAP_M = 25;
const OFFSET_M = 35;

/**
 * If two inferred buses land within ~25m, nudge later ones along the road
 * so both icons are visible. Does not invent buses — only shifts lat/lng.
 */
export function separateOverlappingBusMarkers(
  buses: InferredBus[],
  road: LatLng[],
  minSepM = OVERLAP_M,
): InferredBus[] {
  if (buses.length < 2 || road.length < 2) return buses;

  const along = buses.map((b) =>
    nearestDistanceAlong(road, { lat: b.lat, lng: b.lng }),
  );
  const order = along
    .map((d, i) => ({ d, i }))
    .sort((a, b) => a.d - b.d || a.i - b.i);

  const out = buses.map((b) => ({ ...b }));
  const placedAlong = [...along];

  for (let oi = 1; oi < order.length; oi++) {
    const i = order[oi].i;
    const prevI = order[oi - 1].i;
    const gap = placedAlong[i] - placedAlong[prevI];
    if (gap >= minSepM) continue;
    const target = placedAlong[prevI] + Math.max(minSepM, OFFSET_M);
    const pos = pointAtDistance(road, target);
    if (!pos) continue;
    if (distM(out[i], pos) > 120) continue;
    out[i] = {
      ...out[i],
      lat: pos.lat,
      lng: pos.lng,
      heading: pos.heading,
    };
    placedAlong[i] = pos.distanceM;
  }

  for (let a = 0; a < out.length; a++) {
    for (let b = a + 1; b < out.length; b++) {
      if (distM(out[a], out[b]) >= minSepM) continue;
      const da = nearestDistanceAlong(road, out[a]);
      const db = nearestDistanceAlong(road, out[b]);
      const later = db >= da ? b : a;
      const earlierAlong = Math.min(da, db);
      const pos = pointAtDistance(
        road,
        earlierAlong + Math.max(minSepM, OFFSET_M),
      );
      if (!pos) continue;
      if (distM(out[later], pos) > 120) continue;
      out[later] = {
        ...out[later],
        lat: pos.lat,
        lng: pos.lng,
        heading: pos.heading,
      };
    }
  }

  return out;
}
