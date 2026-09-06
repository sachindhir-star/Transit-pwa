/**
 * Official DBTSL published timetable (Discovery Bay app CSVs).
 * Always-visible baseline for DB buses UX — live eta.dbtsl.com overlays on top when trips exist.
 *
 * Schedule CSVs are keyed by timetable "From" / terminus (bus_line_route), not every roadside stop.
 * fromStops lists each published From when available; routes 1 & 6 also expose an approx village
 * table (+3 min per official remark) where the CSV has no separate village schedule.
 */
import timetableJson from "../data/dbtslTimetable.json" with { type: "json" };

export type DayType = "monThu" | "fri" | "sat" | "sunPh";

export interface TimetableFromStop {
  id: string;
  /** Short chip label (Plaza, Seabee, …) */
  label: string;
  /** Full origin name for “Departures from …” */
  stop: string;
  endPoint: string;
  /** true when times come from official bus_line_schedule for this From */
  published: boolean;
  dayLabels?: Partial<Record<DayType, string>>;
  departures?: Partial<Record<DayType, string[]>>;
  /** Derive times by shifting another fromStop (official village ≈ offset) */
  approxOffsetMinutes?: number;
  approxFromId?: string;
  note?: string;
}

export interface TimetableRoute {
  stop: string;
  endPoint: string;
  dayLabels: Partial<Record<DayType, string>>;
  departures: Partial<Record<DayType, string[]>>;
  /** Optional multi-origin tables (official From + approx village where noted) */
  fromStops?: TimetableFromStop[];
  /** Documented data shape: terminus-from | … */
  scheduleKeyedBy?: string;
}

export interface ScheduledDeparture {
  /** HH:MM clock time */
  time: string;
  /** Minutes from now (HK), may be > 24h if wrapped to tomorrow */
  minutesFromNow: number;
  /** true when the slot is on the next calendar day */
  tomorrow: boolean;
  dayType: DayType;
  dayLabel: string;
}

export interface HourBucket {
  /** 0–23 */
  hour: number;
  /** "18:00" style hour label */
  label: string;
  /** Minute strings "00","08","18"… */
  minutes: string[];
  /** True when every slot in this hour is already past (HK today) */
  allPast: boolean;
}

export interface TodaysSchedule {
  routeNumber: string;
  fromStopId: string;
  /** Short chip label */
  fromLabel: string;
  stop: string;
  endPoint: string;
  published: boolean;
  /** Clarifying note (e.g. approx village offset) */
  originNote: string | null;
  dayType: DayType;
  dayLabel: string;
  /** All HH:MM for today's day-type table */
  times: string[];
  /** Grouped for Timetable-tab style hour/minute grid */
  byHour: HourBucket[];
}

interface TimetableFile {
  version: string;
  source: string;
  note: string;
  holidays: Array<{ start: string; end: string; name: string }>;
  routes: Record<string, TimetableRoute>;
}

const data = timetableJson as TimetableFile;

export const DBTSL_TIMETABLE_VERSION = data.version;
export const DBTSL_TIMETABLE_SOURCE = data.source;
export const DBTSL_TIMETABLE_NOTE = data.note;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** HK calendar parts for timetable day-type selection. */
export function hkParts(now: Date = new Date()): {
  ymd: string;
  weekday: number; // 0=Sun … 6=Sat
  hour: number;
  minute: number;
  minutesOfDay: number;
} {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const hour = Number(parts.hour === "24" ? "0" : parts.hour);
  const minute = Number(parts.minute);
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: weekdayMap[parts.weekday] ?? 0,
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
  };
}

function ymdAddDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function isHoliday(ymd: string): boolean {
  for (const h of data.holidays) {
    if (ymd >= h.start && ymd <= h.end) return true;
  }
  return false;
}

/**
 * Map calendar day → DBTSL schedule bucket.
 * Fri & public-holiday eves use the "fri" table; Sun & PH use "sunPh".
 */
export function dayTypeForYmd(ymd: string, weekday: number): DayType {
  if (isHoliday(ymd) || weekday === 0) return "sunPh";
  if (weekday === 6) return "sat";
  const tomorrow = ymdAddDays(ymd, 1);
  const phEve = isHoliday(tomorrow) && weekday !== 5;
  if (weekday === 5 || phEve) return "fri";
  return "monThu";
}

function parseHhMm(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function minsToHhMm(mins: number): string {
  const wrapped = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function dayLabelFor(
  dayLabels: Partial<Record<DayType, string>> | undefined,
  dayType: DayType,
): string {
  return (
    dayLabels?.[dayType] ??
    (dayType === "monThu"
      ? "Mon - Thu"
      : dayType === "fri"
        ? "Fri & PH Eve"
        : dayType === "sat"
          ? "Saturday"
          : "Sunday & PH")
  );
}

function timesForDay(
  departures: Partial<Record<DayType, string[]>> | undefined,
  dayType: DayType,
): string[] {
  return (
    departures?.[dayType] ??
    departures?.monThu ??
    departures?.sat ??
    []
  );
}

function shiftTimes(times: string[], offsetMinutes: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of times) {
    const mins = parseHhMm(t);
    if (mins == null) continue;
    const clock = minsToHhMm(mins + offsetMinutes);
    if (seen.has(clock)) continue;
    seen.add(clock);
    out.push(clock);
  }
  return out.sort((a, b) => (parseHhMm(a) ?? 0) - (parseHhMm(b) ?? 0));
}

export function getTimetableRoute(routeNumber: string): TimetableRoute | null {
  return data.routes[routeNumber] ?? null;
}

/** Resolve From options for a route (always ≥1 when a timetable exists). */
export function listFromStops(routeNumber: string): TimetableFromStop[] {
  const route = getTimetableRoute(routeNumber);
  if (!route) return [];
  if (route.fromStops?.length) return route.fromStops;
  return [
    {
      id: "primary",
      label: route.stop,
      stop: route.stop,
      endPoint: route.endPoint,
      published: true,
      dayLabels: route.dayLabels,
      departures: route.departures,
    },
  ];
}

export function getFromStop(
  routeNumber: string,
  fromStopId?: string | null,
): TimetableFromStop | null {
  const stops = listFromStops(routeNumber);
  if (!stops.length) return null;
  if (fromStopId) {
    const hit = stops.find((s) => s.id === fromStopId);
    if (hit) return hit;
  }
  return stops[0];
}

function resolvedDepartures(
  routeNumber: string,
  from: TimetableFromStop,
): {
  dayLabels: Partial<Record<DayType, string>>;
  departures: Partial<Record<DayType, string[]>>;
  originNote: string | null;
} {
  if (from.departures && Object.keys(from.departures).length > 0) {
    return {
      dayLabels: from.dayLabels ?? {},
      departures: from.departures,
      originNote: from.published
        ? null
        : (from.note ?? "Approximate departures (not a separate published CSV table)."),
    };
  }
  if (
    from.approxOffsetMinutes != null &&
    from.approxFromId &&
    from.approxOffsetMinutes !== 0
  ) {
    const base = getFromStop(routeNumber, from.approxFromId);
    const baseDeps = base?.departures;
    if (baseDeps) {
      const shifted: Partial<Record<DayType, string[]>> = {};
      for (const key of Object.keys(baseDeps) as DayType[]) {
        const times = baseDeps[key];
        if (times?.length) {
          shifted[key] = shiftTimes(times, from.approxOffsetMinutes);
        }
      }
      return {
        dayLabels: from.dayLabels ?? base.dayLabels ?? {},
        departures: shifted,
        originNote:
          from.note ??
          `Approximate: official note says ~${from.approxOffsetMinutes} min after ${base.label}.`,
      };
    }
  }
  const route = getTimetableRoute(routeNumber);
  return {
    dayLabels: from.dayLabels ?? route?.dayLabels ?? {},
    departures: route?.departures ?? {},
    originNote: from.note ?? null,
  };
}

/** Group HH:MM clock times into Timetable-tab style hour rows. */
export function groupDeparturesByHour(
  times: string[],
  minutesOfDay: number,
): HourBucket[] {
  const map = new Map<number, string[]>();
  for (const time of times) {
    const mins = parseHhMm(time);
    if (mins == null) continue;
    const hour = Math.floor(mins / 60);
    const mm = pad2(mins % 60);
    const list = map.get(hour) ?? [];
    list.push(mm);
    map.set(hour, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, minutes]) => {
      const hourStart = hour * 60;
      const hourEnd = hourStart + 59;
      return {
        hour,
        label: `${pad2(hour)}:00`,
        minutes,
        allPast: hourEnd < minutesOfDay,
      };
    });
}

/** Full published table for today (HK day-type), for the always-visible timetable layer. */
export function getTodaysSchedule(
  routeNumber: string,
  now: Date = new Date(),
  fromStopId?: string | null,
): TodaysSchedule | null {
  const from = getFromStop(routeNumber, fromStopId);
  if (!from) return null;
  const { dayLabels, departures, originNote } = resolvedDepartures(
    routeNumber,
    from,
  );
  const today = hkParts(now);
  const dayType = dayTypeForYmd(today.ymd, today.weekday);
  const times = timesForDay(departures, dayType);
  if (!times.length) return null;
  return {
    routeNumber,
    fromStopId: from.id,
    fromLabel: from.label,
    stop: from.stop,
    endPoint: from.endPoint,
    published: from.published,
    originNote,
    dayType,
    dayLabel: dayLabelFor(dayLabels, dayType),
    times,
    byHour: groupDeparturesByHour(times, today.minutesOfDay),
  };
}

/**
 * Next published departures at the selected From stop.
 * Wraps to tomorrow's table when today's remaining slots are exhausted.
 */
export function nextScheduledDepartures(
  routeNumber: string,
  count = 5,
  now: Date = new Date(),
  fromStopId?: string | null,
): ScheduledDeparture[] {
  const from = getFromStop(routeNumber, fromStopId);
  if (!from) return [];
  const { dayLabels, departures } = resolvedDepartures(routeNumber, from);

  const today = hkParts(now);
  const out: ScheduledDeparture[] = [];

  for (let dayOffset = 0; dayOffset <= 1 && out.length < count; dayOffset++) {
    const ymd = dayOffset === 0 ? today.ymd : ymdAddDays(today.ymd, 1);
    const weekday =
      dayOffset === 0 ? today.weekday : (today.weekday + dayOffset) % 7;
    const dayType = dayTypeForYmd(ymd, weekday);
    const times = timesForDay(departures, dayType);
    const dayLabel = dayLabelFor(dayLabels, dayType);

    for (const time of times) {
      const mins = parseHhMm(time);
      if (mins == null) continue;
      let minutesFromNow: number;
      if (dayOffset === 0) {
        if (mins < today.minutesOfDay) continue;
        minutesFromNow = mins - today.minutesOfDay;
      } else {
        minutesFromNow = 24 * 60 - today.minutesOfDay + mins;
      }
      out.push({
        time,
        minutesFromNow,
        tomorrow: dayOffset === 1,
        dayType,
        dayLabel,
      });
      if (out.length >= count) break;
    }
  }

  return out;
}

export function formatScheduledClock(dep: ScheduledDeparture): string {
  return dep.tomorrow ? `${dep.time} (tomorrow)` : dep.time;
}

/** Header badge text for next timetable slot (never a fake headway). */
export function formatTimetablePill(dep: ScheduledDeparture): string {
  const clock = formatScheduledClock(dep);
  return `${clock} · timetable`;
}

/** Plain-language origin line for the timetable panel. */
export function formatDeparturesFromHeadline(schedule: TodaysSchedule): string {
  return `Departures from ${schedule.stop}`;
}

export function formatBusLeavesAt(schedule: TodaysSchedule, time: string): string {
  return `Bus leaves ${schedule.fromLabel} at ${time}`;
}
