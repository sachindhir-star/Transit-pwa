/**
 * Peng Chau Kaito — Discovery Bay (Nim Shue Wan) ↔ Mui Wo (via Peng Chau weekdays).
 * Published clock times from operator / TD licensed ferry details.
 */
import kaitoJson from "../data/dbKaitoTimetable.json" with { type: "json" };
import { dayTypeForYmd, hkParts } from "./dbtslTimetable";
import { formatHkClock } from "./formatEta";

type FerryDay = "weekday" | "sat" | "sunPh";

interface PierMeta {
  stop: string;
  stopId: string;
  nameZh?: string;
}

interface StopDeparture {
  stopId: string;
  time: string | null;
  role: string;
  note?: string;
  approxArrival?: string;
}

interface WeekdaySailing {
  id: string;
  label: string;
  direction: string;
  viaPengChau: boolean;
  departures: StopDeparture[];
}

interface KaitoFile {
  version: string;
  source: string;
  sourceUrl: string;
  tdUrl?: string;
  effectiveDate: string;
  operator: string;
  boardingNote: string;
  note: string;
  journeyMinDirect: number;
  journeyMinViaPengChau: number;
  piers: Record<string, PierMeta>;
  weekdayViaPengChau: {
    dayLabel: string;
    sailings: WeekdaySailing[];
  };
  weekendDirect: {
    dayLabel: string;
    fromNimShueWan: { sat: string[]; sunPh: string[] };
    fromMuiWo: { sat: string[]; sunPh: string[] };
  };
}

const data = kaitoJson as KaitoFile;

export const KAITO_TIMETABLE_VERSION = data.version;
export const KAITO_TIMETABLE_SOURCE = data.source;
export const KAITO_TIMETABLE_SOURCE_URL = data.sourceUrl;
export const KAITO_TIMETABLE_NOTE = data.note;
export const KAITO_BOARDING_NOTE = data.boardingNote;
export const KAITO_OPERATOR = data.operator;
export const KAITO_JOURNEY_MIN_DIRECT = data.journeyMinDirect;
export const KAITO_JOURNEY_MIN_VIA = data.journeyMinViaPengChau;
export const KAITO_PIERS = data.piers;

export type KaitoCorridor = "mui-wo" | "peng-chau";
export type KaitoBoardPier = "nim-shue-wan" | "peng-chau-pier" | "mui-wo-pier";

export interface KaitoDeparture {
  time: string;
  minutesUntil: number;
  pierLabel: string;
  pierId: string;
  dayLabel: string;
  when: Date;
  viaPengChau: boolean;
  sailingLabel: string;
  destinationHint: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function parseHhMm(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function ferryDayType(ymd: string, weekday: number): FerryDay {
  const dt = dayTypeForYmd(ymd, weekday);
  if (dt === "sunPh") return "sunPh";
  if (dt === "sat") return "sat";
  return "weekday";
}

function dayLabel(day: FerryDay): string {
  if (day === "sat") return "Saturday";
  if (day === "sunPh") return "Sunday & PH";
  return "Mon – Fri (via Peng Chau)";
}

function ymdAddDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function weekdayForYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 4, 0, 0)).getUTCDay();
}

function hkDateAt(ymd: string, minutesOfDay: number): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const hh = Math.floor(minutesOfDay / 60);
  const mm = minutesOfDay % 60;
  return new Date(`${y}-${pad2(m)}-${pad2(d)}T${pad2(hh)}:${pad2(mm)}:00+08:00`);
}

function pierLabel(stopId: string): string {
  return data.piers[stopId]?.stop ?? stopId;
}

function destinationForWeekday(sailing: WeekdaySailing, boardStopId: string): string {
  const stops = sailing.departures.map((d) => d.stopId);
  const idx = stops.indexOf(boardStopId);
  if (idx < 0) return sailing.label;
  const later = stops.slice(idx + 1);
  if (later.includes("mui-wo-pier")) return "Mui Wo";
  if (later.includes("nim-shue-wan")) return "Nim Shue Wan (DB)";
  if (later.includes("peng-chau-pier")) return "Peng Chau";
  return sailing.label;
}

function weekendTimes(board: KaitoBoardPier, day: "sat" | "sunPh"): string[] {
  if (board === "nim-shue-wan") return data.weekendDirect.fromNimShueWan[day];
  if (board === "mui-wo-pier") return data.weekendDirect.fromMuiWo[day];
  return []; // Peng Chau not served on weekend direct sailings
}

function weekendDest(board: KaitoBoardPier): string {
  if (board === "nim-shue-wan") return "Mui Wo (direct)";
  if (board === "mui-wo-pier") return "Nim Shue Wan (direct)";
  return "—";
}

/** Boarding pier options for a corridor chip (timetable From picker). */
export function kaitoFromPiers(corridor: KaitoCorridor, day: FerryDay): KaitoBoardPier[] {
  if (corridor === "peng-chau") {
    if (day === "weekday") return ["nim-shue-wan", "peng-chau-pier", "mui-wo-pier"];
    // Weekend: honest — no via-Peng Chau; still allow NSW / Mui Wo for context
    return ["nim-shue-wan", "mui-wo-pier"];
  }
  // Mui Wo corridor
  if (day === "weekday") return ["nim-shue-wan", "peng-chau-pier", "mui-wo-pier"];
  return ["nim-shue-wan", "mui-wo-pier"];
}

export function kaitoDayForNow(now: Date = new Date()): FerryDay {
  const parts = hkParts(now);
  return ferryDayType(parts.ymd, parts.weekday);
}

/**
 * Next published kaito departures from a boarding pier.
 * corridor "peng-chau" filters to sailings that actually call at Peng Chau
 * (weekday via) or explains weekend direct (no PC stop).
 */
export function nextKaitoDepartures(
  boardPier: KaitoBoardPier,
  corridor: KaitoCorridor,
  limit = 6,
  now: Date = new Date(),
): KaitoDeparture[] {
  const parts = hkParts(now);
  const out: KaitoDeparture[] = [];

  for (let dayOffset = 0; dayOffset <= 2 && out.length < limit; dayOffset++) {
    const ymd = dayOffset === 0 ? parts.ymd : ymdAddDays(parts.ymd, dayOffset);
    const weekday = dayOffset === 0 ? parts.weekday : weekdayForYmd(ymd);
    const day = ferryDayType(ymd, weekday);

    if (day === "weekday") {
      for (const sailing of data.weekdayViaPengChau.sailings) {
        const stopDep = sailing.departures.find(
          (d) => d.stopId === boardPier && d.time,
        );
        if (!stopDep?.time) continue;
        // Peng Chau chip: only show sailings that call at Peng Chau (all weekday do)
        if (corridor === "peng-chau" && !sailing.viaPengChau) continue;
        const mins = parseHhMm(stopDep.time);
        if (mins == null) continue;
        if (dayOffset === 0 && mins < parts.minutesOfDay) continue;
        const when = hkDateAt(ymd, mins);
        out.push({
          time: stopDep.time,
          minutesUntil: Math.max(
            0,
            Math.round((when.getTime() - now.getTime()) / 60_000),
          ),
          pierLabel: pierLabel(boardPier),
          pierId: boardPier,
          dayLabel: dayLabel(day),
          when,
          viaPengChau: true,
          sailingLabel: sailing.label,
          destinationHint: destinationForWeekday(sailing, boardPier),
        });
        if (out.length >= limit) break;
      }
    } else {
      // Weekend / PH — direct NSW↔Mui Wo only
      if (corridor === "peng-chau" && boardPier === "peng-chau-pier") {
        // No published weekend calls at Peng Chau on this licensed service
        continue;
      }
      const times = weekendTimes(boardPier, day);
      for (const time of times) {
        const mins = parseHhMm(time);
        if (mins == null) continue;
        if (dayOffset === 0 && mins < parts.minutesOfDay) continue;
        const when = hkDateAt(ymd, mins);
        out.push({
          time,
          minutesUntil: Math.max(
            0,
            Math.round((when.getTime() - now.getTime()) / 60_000),
          ),
          pierLabel: pierLabel(boardPier),
          pierId: boardPier,
          dayLabel: dayLabel(day),
          when,
          viaPengChau: false,
          sailingLabel: "Direct Nim Shue Wan ↔ Mui Wo",
          destinationHint: weekendDest(boardPier),
        });
        if (out.length >= limit) break;
      }
    }
  }

  out.sort((a, b) => a.when.getTime() - b.when.getTime());
  return out.slice(0, limit);
}

/** All published times for today's day-type from a pier (for hour grid). */
export function todaysKaitoTimes(
  boardPier: KaitoBoardPier,
  corridor: KaitoCorridor,
  now: Date = new Date(),
): { times: string[]; dayLabel: string; viaPengChau: boolean; emptyReason: string | null } {
  const day = kaitoDayForNow(now);
  if (day === "weekday") {
    const times: string[] = [];
    for (const sailing of data.weekdayViaPengChau.sailings) {
      const stopDep = sailing.departures.find(
        (d) => d.stopId === boardPier && d.time,
      );
      if (stopDep?.time) times.push(stopDep.time);
    }
    times.sort();
    return {
      times,
      dayLabel: data.weekdayViaPengChau.dayLabel,
      viaPengChau: true,
      emptyReason:
        times.length === 0
          ? "No weekday departure from this pier on the published kaito table."
          : null,
    };
  }
  if (corridor === "peng-chau" && boardPier === "peng-chau-pier") {
    return {
      times: [],
      dayLabel: data.weekendDirect.dayLabel,
      viaPengChau: false,
      emptyReason:
        "Weekend / PH sailings are direct Nim Shue Wan ↔ Mui Wo and do not call at Peng Chau. Use a weekday for via-Peng Chau, or board at Nim Shue Wan / Mui Wo.",
    };
  }
  const times = weekendTimes(boardPier, day);
  return {
    times,
    dayLabel: data.weekendDirect.dayLabel,
    viaPengChau: false,
    emptyReason:
      times.length === 0
        ? "No weekend departure from this pier on the published kaito table."
        : null,
  };
}

export function formatKaitoClock(dep: KaitoDeparture): string {
  return formatHkClock(dep.when);
}

export function kaitoTimetableCaption(): string {
  return `Kaito timetable · Peng Chau Kaito ${data.effectiveDate}`;
}

export function isWeekendNoPengChau(now: Date = new Date()): boolean {
  return kaitoDayForNow(now) !== "weekday";
}
