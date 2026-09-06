/**
 * DB ↔ Central Pier 3 ferry timetable (published clock times).
 * Source: Transport Department licensed ferry service details.
 */
import ferryJson from "../data/dbFerryTimetable.json" with { type: "json" };
import { dayTypeForYmd, hkParts } from "./dbtslTimetable";
import { formatHkClock } from "./formatEta";
import { shortStopName } from "./stopLabel";
import type { TripLeg } from "../types";

type FerryDay = "weekday" | "sat" | "sunPh";

interface PierTable {
  stop: string;
  stopId: string;
  weekday: string[];
  sat: string[];
  sunPh: string[];
}

interface FerryFile {
  version: string;
  source: string;
  sourceUrl: string;
  effectiveDate: string;
  note: string;
  journeyMin: number;
  fromDb: PierTable;
  fromCentral: PierTable;
}

const data = ferryJson as FerryFile;

export const DB_FERRY_TIMETABLE_VERSION = data.version;
export const DB_FERRY_TIMETABLE_SOURCE = data.source;
export const DB_FERRY_TIMETABLE_SOURCE_URL = data.sourceUrl;
export const DB_FERRY_TIMETABLE_NOTE = data.note;
export const DB_FERRY_JOURNEY_MIN = data.journeyMin;

export interface FerryDeparture {
  time: string; // HH:MM
  minutesUntil: number;
  pierLabel: string;
  dayLabel: string;
  /** Absolute instant used for clock formatting */
  when: Date;
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
  return "Mon – Fri";
}

function timesFor(table: PierTable, day: FerryDay): string[] {
  return table[day] ?? table.weekday;
}

function ymdAddDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function weekdayForYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  // Use noon UTC so HK calendar day is unambiguous for weekday
  return new Date(Date.UTC(y, m - 1, d, 4, 0, 0)).getUTCDay();
}

/** Resolve which published pier table matches the boarding stop. */
export function resolveFerryPierTable(fromStop: {
  id: string;
  name: string;
  lng?: number;
}): PierTable {
  const key = `${fromStop.id} ${fromStop.name}`.toLowerCase();
  if (/central|pier\s*3|pier3/.test(key) || (fromStop.lng != null && fromStop.lng > 114.12)) {
    return data.fromCentral;
  }
  return data.fromDb;
}

function hkDateAt(ymd: string, minutesOfDay: number): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const hh = Math.floor(minutesOfDay / 60);
  const mm = minutesOfDay % 60;
  // Construct as HK wall time via ISO with +08:00
  return new Date(
    `${y}-${pad2(m)}-${pad2(d)}T${pad2(hh)}:${pad2(mm)}:00+08:00`,
  );
}

/**
 * Next published ferry departures from the boarding pier (timetable-first).
 */
export function nextFerryDepartures(
  fromStop: { id: string; name: string; lng?: number },
  limit = 4,
  now: Date = new Date(),
): FerryDeparture[] {
  const table = resolveFerryPierTable(fromStop);
  const parts = hkParts(now);
  const out: FerryDeparture[] = [];

  for (let dayOffset = 0; dayOffset <= 1 && out.length < limit; dayOffset++) {
    const ymd = dayOffset === 0 ? parts.ymd : ymdAddDays(parts.ymd, 1);
    const weekday = dayOffset === 0 ? parts.weekday : weekdayForYmd(ymd);
    const day = ferryDayType(ymd, weekday);
    const times = timesFor(table, day);
    for (const time of times) {
      const mins = parseHhMm(time);
      if (mins == null) continue;
      if (dayOffset === 0 && mins < parts.minutesOfDay) continue;
      const when = hkDateAt(ymd, mins);
      const minutesUntil = Math.max(
        0,
        Math.round((when.getTime() - now.getTime()) / 60_000),
      );
      out.push({
        time,
        minutesUntil,
        pierLabel: table.stop,
        dayLabel: dayLabel(day),
        when,
      });
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function formatFerryClock(dep: FerryDeparture): string {
  return formatHkClock(dep.when);
}

/** e.g. "Next ferry leaves DB Ferry Pier at 10:05pm (9 mins)" */
export function nextFerryHeadline(
  leg: TripLeg,
  now: Date = new Date(),
): string | null {
  const deps = nextFerryDepartures(leg.fromStop, 1, now);
  if (!deps.length) return null;
  const dep = deps[0];
  const stop = shortStopName(leg.fromStop.name) || dep.pierLabel;
  const clock = formatFerryClock(dep);
  return `Next ferry leaves ${stop} at ${clock} (${dep.minutesUntil} mins)`;
}

export function ferryTimetableCaption(): string {
  return `Ferry timetable · TD ${data.effectiveDate}`;
}
