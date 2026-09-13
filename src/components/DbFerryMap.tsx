import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getPlace } from "../data/places";
import {
  FERRY_SEA_CORRIDOR_NOTE,
  dbFerrySeaShape,
  kaitoSeaShape,
  type KaitoSeaMode,
} from "../data/dbFerrySeaPath";
import {
  DB_FERRY_JOURNEY_MIN,
  DB_FERRY_TIMETABLE_NOTE,
  DB_FERRY_TIMETABLE_SOURCE,
  DB_FERRY_TIMETABLE_SOURCE_URL,
  DB_FERRY_TIMETABLE_VERSION,
  formatFerryClock,
  nextFerryDepartures,
  type FerryDeparture,
} from "../lib/dbFerryTimetable";
import {
  KAITO_BOARDING_NOTE,
  KAITO_JOURNEY_MIN_DIRECT,
  KAITO_JOURNEY_MIN_VIA,
  KAITO_OPERATOR,
  KAITO_TIMETABLE_NOTE,
  KAITO_TIMETABLE_SOURCE_URL,
  KAITO_TIMETABLE_VERSION,
  formatKaitoClock,
  isWeekendNoPengChau,
  kaitoDayForNow,
  kaitoFromPiers,
  nextKaitoDepartures,
  todaysKaitoTimes,
  type KaitoBoardPier,
  type KaitoCorridor,
  type KaitoDeparture,
} from "../lib/dbKaitoTimetable";
import { hkParts } from "../lib/dbtslTimetable";
import { haversineM } from "../lib/geo";
import { useGeolocation } from "../hooks/useGeolocation";
import type { StopPoint } from "../types";

type CorridorId = "central" | "mui-wo" | "peng-chau";

interface CorridorChip {
  id: CorridorId;
  label: string;
  blurb: string;
}

const CORRIDORS: CorridorChip[] = [
  {
    id: "central",
    label: "Central",
    blurb: "DBTSL · Plaza Ferry Pier ↔ Central Pier 3",
  },
  {
    id: "mui-wo",
    label: "Mui Wo",
    blurb: "Peng Chau Kaito · Nim Shue Wan ↔ Mui Wo",
  },
  {
    id: "peng-chau",
    label: "Peng Chau",
    blurb: "Same kaito corridor · weekday via Peng Chau",
  },
];

const FERRY_MAP_CENTER: [number, number] = [22.29, 114.04];
const FERRY_MAP_ZOOM = 12;

function placeStop(id: string, fallback: StopPoint): StopPoint {
  const p = getPlace(id);
  if (!p) return fallback;
  return {
    id: p.id,
    name: p.name,
    nameZh: p.nameZh,
    lat: p.lat,
    lng: p.lng,
  };
}

const DB_PIER = placeStop("db-ferry", {
  id: "db-ferry",
  name: "DB Ferry Pier",
  lat: 22.2963,
  lng: 114.0178,
});
const CENTRAL_PIER = placeStop("central-pier3", {
  id: "central-pier3",
  name: "Central Pier 3",
  lat: 22.2871,
  lng: 114.1606,
});
const NSW_PIER = placeStop("nim-shue-wan", {
  id: "nim-shue-wan",
  name: "Nim Shue Wan Landing Steps",
  lat: 22.29322,
  lng: 114.02159,
});
const PENG_CHAU_PIER = placeStop("peng-chau-pier", {
  id: "peng-chau-pier",
  name: "Peng Chau Public Pier",
  lat: 22.287,
  lng: 114.0385,
});
const MUI_WO_PIER = placeStop("mui-wo-pier", {
  id: "mui-wo-pier",
  name: "Mui Wo Landing Steps",
  lat: 22.2645,
  lng: 114.0015,
});

function FitFerry({
  points,
  user,
}: {
  points: StopPoint[];
  user: { lat: number; lng: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = points.map((s) => [s.lat, s.lng]);
    if (user) pts.push([user.lat, user.lng]);
    if (pts.length < 2) {
      map.setView(FERRY_MAP_CENTER, FERRY_MAP_ZOOM);
      return;
    }
    const bounds = L.latLngBounds(pts);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [map, points, user]);
  return null;
}

function userIcon() {
  return L.divIcon({
    className: "db-user-icon",
    html: `<div class="db-user-marker" title="You">
      <span class="db-user-pulse"></span>
      <span class="db-user-dot"></span>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -12],
  });
}

function pierById(id: string): StopPoint {
  if (id === "db-ferry") return DB_PIER;
  if (id === "central-pier3") return CENTRAL_PIER;
  if (id === "nim-shue-wan") return NSW_PIER;
  if (id === "peng-chau-pier") return PENG_CHAU_PIER;
  if (id === "mui-wo-pier") return MUI_WO_PIER;
  return NSW_PIER;
}

function nearestPier(
  user: { lat: number; lng: number },
  pierIds: string[],
): { id: string; name: string; meters: number } | null {
  let best: { id: string; name: string; meters: number } | null = null;
  for (const id of pierIds) {
    const p = pierById(id);
    const meters = Math.round(haversineM(user, p));
    if (!best || meters < best.meters) {
      best = { id, name: p.name, meters };
    }
  }
  return best;
}

function groupByHour(times: string[], minutesOfDay: number) {
  const buckets = new Map<number, { hour: number; label: string; minutes: string[]; allPast: boolean }>();
  for (const t of times) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t);
    if (!m) continue;
    const hour = Number(m[1]);
    const mm = m[2];
    const minsOf = hour * 60 + Number(mm);
    let row = buckets.get(hour);
    if (!row) {
      row = {
        hour,
        label: `${String(hour).padStart(2, "0")}:00`,
        minutes: [],
        allPast: true,
      };
      buckets.set(hour, row);
    }
    row.minutes.push(mm);
    if (minsOf >= minutesOfDay) row.allPast = false;
  }
  return [...buckets.values()].sort((a, b) => a.hour - b.hour);
}

export function DbFerryMap() {
  const [corridorId, setCorridorId] = useState<CorridorId>("central");
  const [fromPierId, setFromPierId] = useState<string>("db-ferry");
  const geo = useGeolocation(true);

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 20_000);
    return () => window.clearInterval(id);
  }, []);
  const now = useMemo(() => new Date(nowTick), [nowTick]);
  const hkNow = useMemo(() => hkParts(now), [now]);
  const kaitoDay = useMemo(() => kaitoDayForNow(now), [now]);
  const weekendNoPc = useMemo(() => isWeekendNoPengChau(now), [now]);

  const corridor = CORRIDORS.find((c) => c.id === corridorId) ?? CORRIDORS[0];

  const fromOptions = useMemo(() => {
    if (corridorId === "central") {
      return [
        { id: "db-ferry", label: "DB Ferry Pier", hint: "Plaza Lane" },
        { id: "central-pier3", label: "Central Pier 3", hint: "to DB" },
      ];
    }
    const board = kaitoFromPiers(corridorId as KaitoCorridor, kaitoDay);
    return board.map((id) => {
      const p = pierById(id);
      return {
        id,
        label:
          id === "nim-shue-wan"
            ? "Nim Shue Wan"
            : id === "peng-chau-pier"
              ? "Peng Chau"
              : "Mui Wo",
        hint: p.name,
      };
    });
  }, [corridorId, kaitoDay]);

  // Reset / keep valid From when corridor or day-type changes
  useEffect(() => {
    if (!fromOptions.length) return;
    setFromPierId((prev) =>
      fromOptions.some((o) => o.id === prev) ? prev : fromOptions[0].id,
    );
  }, [fromOptions]);

  // Suggest From pier from geolocation when corridor changes
  useEffect(() => {
    if (!geo.position || !fromOptions.length) return;
    const near = nearestPier(
      geo.position,
      fromOptions.map((o) => o.id),
    );
    if (near && near.meters < 2500) {
      setFromPierId(near.id);
    }
  }, [corridorId, geo.position, fromOptions]);

  const mapPiers: StopPoint[] = useMemo(() => {
    if (corridorId === "central") return [DB_PIER, CENTRAL_PIER];
    if (corridorId === "peng-chau" && kaitoDay === "weekday") {
      return [NSW_PIER, PENG_CHAU_PIER, MUI_WO_PIER];
    }
    if (corridorId === "mui-wo" && kaitoDay === "weekday") {
      return [NSW_PIER, PENG_CHAU_PIER, MUI_WO_PIER];
    }
    return [NSW_PIER, MUI_WO_PIER];
  }, [corridorId, kaitoDay]);

  const seaLine: StopPoint[] = useMemo(() => {
    if (corridorId === "central") {
      const fromIsDb = fromPierId === "db-ferry";
      return dbFerrySeaShape(
        fromIsDb ? DB_PIER : CENTRAL_PIER,
        fromIsDb ? CENTRAL_PIER : DB_PIER,
      );
    }
    const mode: KaitoSeaMode =
      kaitoDay === "weekday" ? "via-peng-chau" : "direct";
    if (mode === "via-peng-chau") {
      // Order by typical sailing direction for the selected From
      if (fromPierId === "mui-wo-pier") {
        return kaitoSeaShape([MUI_WO_PIER, PENG_CHAU_PIER, NSW_PIER], mode);
      }
      if (fromPierId === "peng-chau-pier") {
        // Show full corridor both ways contextually — afternoon is NSW→PC→Mui Wo
        return kaitoSeaShape([NSW_PIER, PENG_CHAU_PIER, MUI_WO_PIER], mode);
      }
      return kaitoSeaShape([NSW_PIER, PENG_CHAU_PIER, MUI_WO_PIER], mode);
    }
    if (fromPierId === "mui-wo-pier") {
      return kaitoSeaShape([MUI_WO_PIER, NSW_PIER], "direct");
    }
    return kaitoSeaShape([NSW_PIER, MUI_WO_PIER], "direct");
  }, [corridorId, fromPierId, kaitoDay]);

  const line = useMemo(
    () => seaLine.map((s) => [s.lat, s.lng] as [number, number]),
    [seaLine],
  );

  const centralDeps: FerryDeparture[] = useMemo(() => {
    if (corridorId !== "central") return [];
    const from = pierById(fromPierId);
    return nextFerryDepartures(from, 6, now);
  }, [corridorId, fromPierId, now]);

  const kaitoDeps: KaitoDeparture[] = useMemo(() => {
    if (corridorId === "central") return [];
    return nextKaitoDepartures(
      fromPierId as KaitoBoardPier,
      corridorId as KaitoCorridor,
      6,
      now,
    );
  }, [corridorId, fromPierId, now]);

  const kaitoToday = useMemo(() => {
    if (corridorId === "central") return null;
    return todaysKaitoTimes(
      fromPierId as KaitoBoardPier,
      corridorId as KaitoCorridor,
      now,
    );
  }, [corridorId, fromPierId, now]);

  const nextHeadline = useMemo(() => {
    if (corridorId === "central") {
      const dep = centralDeps[0];
      if (!dep) return "No more published sailings today — see tomorrow’s table";
      return `Next ferry leaves ${dep.pierLabel} at ${formatFerryClock(dep)} (${dep.minutesUntil} mins)`;
    }
    const dep = kaitoDeps[0];
    if (!dep) {
      if (kaitoToday?.emptyReason) return kaitoToday.emptyReason;
      return "No more published sailings from this pier soon";
    }
    return `Next ferry leaves ${dep.pierLabel} at ${formatKaitoClock(dep)} (${dep.minutesUntil} mins) → ${dep.destinationHint}`;
  }, [corridorId, centralDeps, kaitoDeps, kaitoToday]);

  const suggestion = useMemo(() => {
    if (!geo.position) return null;
    const ids =
      corridorId === "central"
        ? ["db-ferry", "central-pier3"]
        : fromOptions.map((o) => o.id);
    const near = nearestPier(geo.position, ids);
    if (!near) return null;
    const walkMins = Math.max(1, Math.round(near.meters / 80));
    return { ...near, walkMins };
  }, [geo.position, corridorId, fromOptions]);

  const hourGrid = useMemo(() => {
    if (corridorId === "central") {
      // Pull today's remaining + all from nextFerryDepartures isn't enough for full grid;
      // rebuild from nextFerryDepartures pier table via a light approach: use deps for list only.
      return null;
    }
    if (!kaitoToday) return null;
    return groupByHour(kaitoToday.times, hkNow.minutesOfDay);
  }, [corridorId, kaitoToday, hkNow.minutesOfDay]);

  const centralHourGrid = useMemo(() => {
    if (corridorId !== "central") return null;
    // Reuse nextFerryDepartures for "next" list; for hour grid import pier tables via repeated day scan
    // by reading all times from today's published table through a small helper:
    const from = pierById(fromPierId);
    // Collect today's times by walking nextFerryDepartures with a synthetic midnight — use deps source:
    // Simpler: gather from format by calling next with high limit from start of day
    const midnight = new Date(
      `${hkNow.ymd}T00:00:00+08:00`,
    );
    const all = nextFerryDepartures(from, 80, midnight).filter(
      (d) => d.dayLabel === (kaitoDay === "weekday" ? "Mon – Fri" : d.dayLabel),
    );
    // Filter to same calendar day label matching ferryDay
    const todayLabel =
      kaitoDay === "sat"
        ? "Saturday"
        : kaitoDay === "sunPh"
          ? "Sunday & PH"
          : "Mon – Fri";
    const times = all
      .filter((d) => d.dayLabel === todayLabel)
      .map((d) => d.time);
    // Deduplicate while preserving order
    const uniq: string[] = [];
    for (const t of times) if (!uniq.includes(t)) uniq.push(t);
    return {
      times: uniq,
      byHour: groupByHour(uniq, hkNow.minutesOfDay),
      dayLabel: todayLabel,
    };
  }, [corridorId, fromPierId, hkNow.ymd, hkNow.minutesOfDay, kaitoDay]);

  const userPos = geo.position;
  const operatorLine =
    corridorId === "central"
      ? "DBTSL · Discovery Bay Transportation Services"
      : `${KAITO_OPERATOR}`;

  const journeyNote =
    corridorId === "central"
      ? `~${DB_FERRY_JOURNEY_MIN} min · Pier 3`
      : kaitoDay === "weekday"
        ? `~${KAITO_JOURNEY_MIN_VIA} min via Peng Chau`
        : `~${KAITO_JOURNEY_MIN_DIRECT} min direct`;

  const statusBanner =
    corridorId === "central"
      ? `Timetable-only · ${DB_FERRY_TIMETABLE_SOURCE} v${DB_FERRY_TIMETABLE_VERSION}. ${FERRY_SEA_CORRIDOR_NOTE}. No live vessel GPS.`
      : `Timetable-only · ${KAITO_OPERATOR} v${KAITO_TIMETABLE_VERSION}. ${KAITO_BOARDING_NOTE} ${FERRY_SEA_CORRIDOR_NOTE}.`;

  return (
    <section className="db-bus db-ferry">
      <div className="db-bus-head">
        <div className="db-bus-head-row">
          <h2>Ferries</h2>
          <div className="db-live-controls">
            <span className="db-updated" aria-live="polite">
              Timetable · auto-refresh ~20s
            </span>
            <button
              type="button"
              className="db-refresh"
              onClick={() => setNowTick(Date.now())}
              aria-label="Refresh ferry timetable"
            >
              Refresh
            </button>
          </div>
        </div>
        <p className="note">
          <strong>Timetable-first</strong> for Discovery Bay ferries — destination chips, pier
          map, and published clock times. <strong>No live vessel GPS</strong>. Central uses the
          Plaza ferry pier; Mui Wo / Peng Chau use <strong>Nim Shue Wan Landing Steps</strong>{" "}
          (Marina Drive).
        </p>
      </div>

      <div className="db-chips" role="tablist" aria-label="Ferry corridors">
        {CORRIDORS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`db-chip ${c.id === corridor.id ? "active" : ""} featured`}
            onClick={() => setCorridorId(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {geo.status === "granted" && suggestion ? (
        <div className="db-suggest" role="status">
          <div className="db-suggest-title">
            Nearest pier for this corridor: {suggestion.name}
          </div>
          <ul className="db-suggest-meta">
            <li>
              <strong>Distance:</strong> ~{suggestion.walkMins} min walk ({suggestion.meters} m)
            </li>
            <li>
              <strong>Tip:</strong>{" "}
              {corridorId === "central"
                ? "Central sailings board at DB Plaza Ferry Pier (or Central Pier 3 inbound)."
                : "Mui Wo / Peng Chau kaito boards at Nim Shue Wan — not the Plaza pier."}
            </li>
          </ul>
        </div>
      ) : (
        <div className="db-suggest db-suggest-muted">
          {geo.status === "prompting" || geo.status === "idle" ? (
            <p className="note">Getting your location for pier suggestions…</p>
          ) : (
            <>
              <p className="note">
                {geo.status === "denied"
                  ? "Location permission denied — enable it to get nearest-pier suggestions."
                  : "Location unavailable — enable it to get nearest-pier suggestions."}
              </p>
              <button type="button" className="db-loc-btn" onClick={geo.retry}>
                Enable location for suggestions
              </button>
            </>
          )}
        </div>
      )}

      <div className="db-route-card">
        <div className="option-top">
          <strong>
            {corridor.label} · {operatorLine}
          </strong>
          <span className="pill pill-schedule">{journeyNote}</span>
        </div>
        <p className="note">{corridor.blurb}</p>
        <div className="db-track-banner schedule">
          <span>{statusBanner}</span>
        </div>

        {corridorId !== "central" && weekendNoPc && corridorId === "peng-chau" ? (
          <p className="note db-ferry-honest">
            <strong>Honest label:</strong> Sat/Sun/PH kaito sailings are{" "}
            <strong>direct Nim Shue Wan ↔ Mui Wo</strong> and do{" "}
            <strong>not</strong> call at Peng Chau. Weekday service stops at Peng Chau Public
            Pier.
          </p>
        ) : null}

        {corridorId !== "central" ? (
          <p className="note db-ferry-honest">{KAITO_BOARDING_NOTE}</p>
        ) : (
          <p className="note">{DB_FERRY_TIMETABLE_NOTE}</p>
        )}

        <div
          className="db-timetable"
          role="region"
          aria-label={`Ferry timetable from ${fromPierId}`}
        >
          <div className="db-timetable-origin">
            <div className="db-timetable-origin-main">{nextHeadline}</div>
            <div className="db-timetable-origin-dir">
              {corridorId === "central"
                ? fromPierId === "db-ferry"
                  ? "Toward Central Pier 3"
                  : "Toward DB Ferry Pier"
                : kaitoDeps[0]
                  ? `Toward ${kaitoDeps[0].destinationHint}`
                  : corridor.blurb}
            </div>
            <div className="db-timetable-origin-meta">
              {corridorId === "central"
                ? `Published TD/DBTSL · v${DB_FERRY_TIMETABLE_VERSION}`
                : `Published Peng Chau Kaito · v${KAITO_TIMETABLE_VERSION}${
                    kaitoToday?.viaPengChau ? " · via Peng Chau" : " · direct"
                  }`}
            </div>
          </div>

          {fromOptions.length > 1 ? (
            <div className="db-tt-from">
              <label className="db-tt-from-label" htmlFor="ferry-tt-from">
                From pier
              </label>
              <div className="db-tt-from-chips" role="group" aria-label="Boarding pier">
                {fromOptions.map((fs) => (
                  <button
                    key={fs.id}
                    type="button"
                    className={`db-tt-from-chip${fromPierId === fs.id ? " active" : ""}`}
                    onClick={() => setFromPierId(fs.id)}
                    aria-pressed={fromPierId === fs.id}
                    title={fs.hint}
                  >
                    {fs.label}
                  </button>
                ))}
              </div>
              <select
                id="ferry-tt-from"
                className="db-tt-from-select"
                value={fromPierId}
                onChange={(e) => setFromPierId(e.target.value)}
                aria-label="From pier"
              >
                {fromOptions.map((fs) => (
                  <option key={fs.id} value={fs.id}>
                    {fs.label} — {fs.hint}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <p className="note db-timetable-note">
            Published schedule (not live ETA) · no vessel GPS dots on the map.
          </p>

          {(corridorId === "central" ? centralDeps : kaitoDeps).length > 0 ? (
            <>
              <div className="db-timetable-subtitle">
                Ferry leaves{" "}
                {corridorId === "central"
                  ? pierById(fromPierId).name
                  : pierById(fromPierId).name}{" "}
                at…
              </div>
              <ul className="db-timetable-list">
                {corridorId === "central"
                  ? centralDeps.map((dep) => (
                      <li key={`c-${dep.time}-${dep.minutesUntil}`}>
                        <span className="db-timetable-clock">{formatFerryClock(dep)}</span>
                        <span className="db-timetable-tag">
                          {dep.minutesUntil} mins · timetable
                        </span>
                      </li>
                    ))
                  : kaitoDeps.map((dep) => (
                      <li key={`k-${dep.time}-${dep.pierId}-${dep.destinationHint}`}>
                        <span className="db-timetable-clock">{formatKaitoClock(dep)}</span>
                        <span className="db-timetable-tag">
                          {dep.minutesUntil} mins · {dep.viaPengChau ? "via PC" : "direct"}
                        </span>
                        <span className="note">→ {dep.destinationHint}</span>
                      </li>
                    ))}
              </ul>
            </>
          ) : (
            <p className="note">
              {kaitoToday?.emptyReason ??
                "No upcoming published departures from this pier in the embedded table."}
            </p>
          )}

          {corridorId === "central" && centralHourGrid && centralHourGrid.byHour.length > 0 ? (
            <>
              <div className="db-timetable-subtitle">
                Today · {centralHourGrid.dayLabel} · hours / minutes
              </div>
              <div
                className="db-tt-grid"
                role="table"
                aria-label="Central ferry hour grid"
              >
                {centralHourGrid.byHour.map((row) => (
                  <div
                    key={row.hour}
                    className={`db-tt-row${row.allPast ? " past" : ""}${
                      row.hour === hkNow.hour ? " current" : ""
                    }`}
                    role="row"
                  >
                    <span className="db-tt-hour" role="rowheader">
                      {row.label}
                    </span>
                    <span className="db-tt-mins" role="cell">
                      {row.minutes.map((mm) => {
                        const clock = `${String(row.hour).padStart(2, "0")}:${mm}`;
                        const minsOf = row.hour * 60 + Number(mm);
                        const past = minsOf < hkNow.minutesOfDay;
                        const isNext =
                          !past && centralDeps[0] && centralDeps[0].time === clock;
                        return (
                          <span
                            key={clock}
                            className={`db-tt-min${past ? " past" : ""}${isNext ? " next" : ""}`}
                          >
                            {mm}
                          </span>
                        );
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {hourGrid && hourGrid.length > 0 ? (
            <>
              <div className="db-timetable-subtitle">
                Today · {kaitoToday?.dayLabel} · hours / minutes
              </div>
              <div className="db-tt-grid" role="table" aria-label="Kaito ferry hour grid">
                {hourGrid.map((row) => (
                  <div
                    key={row.hour}
                    className={`db-tt-row${row.allPast ? " past" : ""}${
                      row.hour === hkNow.hour ? " current" : ""
                    }`}
                    role="row"
                  >
                    <span className="db-tt-hour" role="rowheader">
                      {row.label}
                    </span>
                    <span className="db-tt-mins" role="cell">
                      {row.minutes.map((mm) => {
                        const clock = `${String(row.hour).padStart(2, "0")}:${mm}`;
                        const minsOf = row.hour * 60 + Number(mm);
                        const past = minsOf < hkNow.minutesOfDay;
                        const isNext =
                          !past && kaitoDeps[0] && kaitoDeps[0].time === clock;
                        return (
                          <span
                            key={clock}
                            className={`db-tt-min${past ? " past" : ""}${isNext ? " next" : ""}`}
                          >
                            {mm}
                          </span>
                        );
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>

        <p className="note">
          Sources:{" "}
          {corridorId === "central" ? (
            <a href={DB_FERRY_TIMETABLE_SOURCE_URL} target="_blank" rel="noreferrer">
              TD / DBTSL Central–DB
            </a>
          ) : (
            <a href={KAITO_TIMETABLE_SOURCE_URL} target="_blank" rel="noreferrer">
              Peng Chau Kaito timetable
            </a>
          )}
          {corridorId !== "central" ? (
            <>
              {" "}
              · {KAITO_TIMETABLE_NOTE}
            </>
          ) : null}
        </p>
      </div>

      <div className="map-wrap db-map-wrap">
        <MapContainer
          center={FERRY_MAP_CENTER}
          zoom={FERRY_MAP_ZOOM}
          className="map"
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitFerry points={seaLine.length ? seaLine : mapPiers} user={userPos} />
          <Polyline
            positions={line}
            pathOptions={{
              color: "#1a6b8a",
              weight: 5,
              opacity: 0.85,
              dashArray: "10 8",
            }}
          />
          {mapPiers.map((stop, i) => {
            const isFrom = stop.id === fromPierId;
            const isNear = suggestion?.id === stop.id;
            return (
              <CircleMarker
                key={`${stop.id}-${i}`}
                center={[stop.lat, stop.lng]}
                radius={isFrom || isNear ? 9 : 7}
                pathOptions={{
                  color: isFrom ? "#1d6f42" : isNear ? "#1a4f7a" : "#1a6b8a",
                  fillColor: isFrom ? "#27ae60" : isNear ? "#3d8bfd" : "#d6eef7",
                  fillOpacity: 1,
                }}
              >
                <Popup>
                  <strong>
                    {stop.name}
                    {isFrom ? " · boarding" : ""}
                    {isNear ? " · nearest to you" : ""}
                  </strong>
                  {stop.nameZh ? (
                    <>
                      <br />
                      {stop.nameZh}
                    </>
                  ) : null}
                  <br />
                  <em>Pier marker · no vessel GPS</em>
                </Popup>
              </CircleMarker>
            );
          })}
          {userPos ? (
            <Marker position={[userPos.lat, userPos.lng]} icon={userIcon()} zIndexOffset={800}>
              <Popup>
                <strong>You</strong>
                <br />
                Live GPS
                {userPos.accuracyM != null
                  ? ` · ±${Math.round(userPos.accuracyM)} m`
                  : ""}
              </Popup>
            </Marker>
          ) : null}
        </MapContainer>
      </div>

      <p className="note db-ferry-map-caption">
        Map: pier markers + approximate sea corridor only. Dashed blue path stays in water — never
        a land chord through islands. {FERRY_SEA_CORRIDOR_NOTE}.
      </p>
    </section>
  );
}
