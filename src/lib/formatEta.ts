/** Asia/Hong_Kong clock + remaining minutes for phone-readable ETA chips. */

import { shortStopName } from "./stopLabel";
import type { LiveEta, TripLeg } from "../types";

const HK_TZ = "Asia/Hong_Kong";

/** e.g. 4:37pm (lowercase am/pm, no leading zero on hour). */
export function formatHkClock(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: HK_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  const dayPeriod = (parts.find((p) => p.type === "dayPeriod")?.value ?? "").toLowerCase();
  return `${hour}:${minute}${dayPeriod}`;
}

/**
 * Absolute HK clock time plus countdown in parentheses.
 * Examples: `4:37pm (0 mins)`, `4:51pm (14 mins)`.
 * Prefer `etaIso` when the API provides an absolute timestamp; otherwise
 * compute now + minutes.
 */
export function formatEtaLabel(opts: {
  etaIso?: string | null;
  minutes?: number | null;
  now?: Date;
}): string | null {
  const now = opts.now ?? new Date();
  let when: Date | null = null;
  let minutes = opts.minutes ?? null;

  if (opts.etaIso) {
    const t = Date.parse(opts.etaIso);
    if (!Number.isNaN(t)) {
      when = new Date(t);
      if (minutes == null) {
        minutes = Math.round((t - now.getTime()) / 60000);
      }
    }
  }

  if (minutes == null && !when) return null;

  const mins = Math.max(0, minutes ?? 0);
  if (!when) {
    when = new Date(now.getTime() + mins * 60_000);
  }

  return `${formatHkClock(when)} (${mins} mins)`;
}

export function filterUsableEtas(etas: LiveEta[]): LiveEta[] {
  return etas.filter((e) => {
    if (e.etaIso && !Number.isNaN(Date.parse(e.etaIso))) return true;
    return e.minutes != null && Number.isFinite(e.minutes);
  });
}

/** e.g. "Next 914P leaves IFC Mall at 9:32pm (6 mins)" */
export function nextDepartureHeadline(leg: TripLeg, etas: LiveEta[]): string | null {
  const route = leg.route ?? leg.mode;
  const stop = shortStopName(leg.fromStop.name);
  const rows = filterUsableEtas(etas);
  if (!rows.length) return null;
  const label = formatEtaLabel({ etaIso: rows[0].etaIso, minutes: rows[0].minutes });
  if (!label) return null;
  const m = label.match(/^(.+?)\s+\((\d+)\s+mins\)$/);
  if (m) {
    return `Next ${route} leaves ${stop} at ${m[1]} (${m[2]} mins)`;
  }
  return `Next ${route} leaves ${stop} at ${label}`;
}
