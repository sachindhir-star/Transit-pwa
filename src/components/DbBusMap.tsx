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
import {
  DB_BUS_ROUTES,
  DB_MAP_CENTER,
  DB_MAP_ZOOM,
} from "../data/dbBuses";
import {
  dbtslStopsToPoints,
  formatActiveTripsStatus,
  inferDbtslBusesAllDirections,
} from "../api/dbtslEta";
import { BusColumnBoard } from "./BusColumnBoard";
import { useDbtslLive } from "../hooks/useDbtslLive";
import {
  snapStopsToRoadsDetailed,
  type LatLng,
  type SnapSource,
} from "../api/roadGeometry";
import { formatEtaLabel } from "../lib/formatEta";
import {
  buildLocationSuggestion,
  listActiveTrips,
  type TripFocus,
} from "../lib/dbSuggest";
import {
  DBTSL_TIMETABLE_VERSION,
  formatDeparturesFromHeadline,
  formatScheduledClock,
  formatTimetablePill,
  getTodaysSchedule,
  hkParts,
  listFromStops,
  nextScheduledDepartures,
} from "../lib/dbtslTimetable";
import { useGeolocation } from "../hooks/useGeolocation";
import type { InferredBus, StopPoint } from "../types";

function FitDb({
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
      map.setView(DB_MAP_CENTER, DB_MAP_ZOOM);
      return;
    }
    const bounds = L.latLngBounds(pts);
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
  }, [map, points, user]);
  return null;
}

/** Clear bus SVG facing north; rotated via CSS by heading degrees. */
function busIcon(heading: number, label: string) {
  const rot = Number.isFinite(heading) ? heading : 0;
  const safe = label.replace(/"/g, "&quot;");
  return L.divIcon({
    className: "db-bus-icon",
    html: `<div class="db-bus-marker" title="${safe}" style="transform:rotate(${rot}deg)">
      <svg viewBox="0 0 40 48" width="36" height="44" aria-hidden="true">
        <g>
          <path d="M20 2 L28 12 L24 12 L24 18 L16 18 L16 12 L12 12 Z" fill="#1a4f7a"/>
          <rect x="10" y="12" width="20" height="30" rx="5" fill="#3d8bfd" stroke="#0f3a5c" stroke-width="1.5"/>
          <rect x="13" y="16" width="14" height="8" rx="2" fill="#dceeff"/>
          <rect x="13" y="26" width="14" height="5" rx="1.5" fill="#1a4f7a" opacity="0.35"/>
          <circle cx="15" cy="39" r="2.4" fill="#0f3a5c"/>
          <circle cx="25" cy="39" r="2.4" fill="#0f3a5c"/>
          <rect x="17" y="33" width="6" height="2.5" rx="1" fill="#fff" opacity="0.9"/>
        </g>
      </svg>
    </div>`,
    iconSize: [36, 44],
    iconAnchor: [18, 30],
    popupAnchor: [0, -28],
  });
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

function geometryLabel(source: SnapSource | null, busy: boolean): string {
  if (busy) return "Snapping route to roads (OSRM)…";
  if (source === "osrm") return "Path: OSRM road-following between ordered stops";
  if (source === "mixed")
    return "Path: mostly OSRM roads — some segments fell back to stop chords (labeled)";
  if (source === "stop-chords")
    return "Path: stop-to-stop chords (OSRM unavailable) — not a full road shape";
  return "";
}

export function DbBusMap() {
  const featured = useMemo(
    () => DB_BUS_ROUTES.filter((r) => r.featured).concat(DB_BUS_ROUTES.filter((r) => !r.featured)),
    [],
  );
  const [selectedId, setSelectedId] = useState<string>("db-c4");
  const [fromStopId, setFromStopId] = useState<string | null>(null);
  const route = featured.find((r) => r.id === selectedId) ?? featured[0];
  const fromStops = useMemo(() => listFromStops(route.number), [route.number]);

  // Reset From when the route chip changes; keep a valid id if still present.
  useEffect(() => {
    if (!fromStops.length) {
      setFromStopId(null);
      return;
    }
    setFromStopId((prev) =>
      prev && fromStops.some((s) => s.id === prev) ? prev : fromStops[0].id,
    );
  }, [route.number, fromStops]);
  const live = useDbtslLive(route.number);
  const geo = useGeolocation(true);

  /** Tick so timetable "next" / past-hour styling stays current without fake headways. */
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const now = useMemo(() => new Date(nowTick), [nowTick]);

  const shapeStops: StopPoint[] = useMemo(() => {
    if (live.stops && live.stops.length >= 2) return dbtslStopsToPoints(live.stops);
    return route.stops;
  }, [live.stops, route.stops]);

  const shapeKey = useMemo(
    () => shapeStops.map((s) => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`).join("|"),
    [shapeStops],
  );

  const [roadLine, setRoadLine] = useState<LatLng[]>([]);
  const [roadSource, setRoadSource] = useState<SnapSource | null>(null);
  const [roadBusy, setRoadBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRoadBusy(true);
    setRoadSource(null);
    void (async () => {
      try {
        const result = await snapStopsToRoadsDetailed(shapeStops);
        if (cancelled) return;
        setRoadLine(result.points.length >= 2 ? result.points : shapeStops);
        setRoadSource(result.source);
      } catch (e) {
        console.warn("DB OSRM snap failed", e);
        if (!cancelled) {
          setRoadLine(shapeStops);
          setRoadSource("stop-chords");
        }
      } finally {
        if (!cancelled) setRoadBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shapeKey, shapeStops]);

  const line = useMemo(
    () => (roadLine.length >= 2 ? roadLine : shapeStops).map((s) => [s.lat, s.lng] as [number, number]),
    [roadLine, shapeStops],
  );

  /** All active trips across every destination/variant — map shows every bus. */
  const buses: InferredBus[] = useMemo(() => {
    if (!live.directions?.length) return [];
    const road = roadLine.length >= 2 ? roadLine : shapeStops;
    return inferDbtslBusesAllDirections(live.directions, road);
  }, [live.directions, roadLine, shapeStops]);

  /** Always-visible published schedule (timetable-first baseline). */
  const todaysSchedule = useMemo(
    () => getTodaysSchedule(route.number, now, fromStopId),
    [route.number, now, fromStopId],
  );
  const timetableNext = useMemo(
    () => nextScheduledDepartures(route.number, 8, now, fromStopId),
    [route.number, now, fromStopId],
  );
  const hkNow = useMemo(() => hkParts(now), [now]);

  /**
   * Header pill: live next ETA when trips exist; else next timetable clock
   * labeled "timetable". Never blank, never fake "~headway min".
   */
  const headerPill = useMemo(() => {
    if (buses.length > 0) {
      const mins = Math.min(...buses.map((b) => b.etaMinutes));
      return {
        text: mins <= 0 ? "Due · live" : `${mins} min · live`,
        kind: "live" as const,
      };
    }
    if (timetableNext[0]) {
      return {
        text: formatTimetablePill(timetableNext[0]),
        kind: "schedule" as const,
      };
    }
    if (live.query && live.stops === null && !live.error) {
      return { text: "…", kind: "empty" as const };
    }
    return { text: "Timetable", kind: "schedule" as const };
  }, [buses, timetableNext, live.query, live.stops, live.error]);

  const trips: TripFocus[] = useMemo(
    () => (live.stops?.length ? listActiveTrips(live.stops) : []),
    [live.stops],
  );

  const suggestion = useMemo(() => {
    if (!geo.position) return null;
    return buildLocationSuggestion({
      user: geo.position,
      shapeStops,
      liveStops: live.stops,
      buses,
      trips,
    });
  }, [geo.position, shapeStops, live.stops, buses, trips]);

  /** Stop list focus: prefer location-suggested trip, else soonest on primary direction. */
  const activeTrip: TripFocus | null = suggestion?.trip ?? trips[0] ?? null;

  const statusBanner = useMemo(() => {
    const geoLabel = geometryLabel(roadSource, roadBusy);
    const ttHint = todaysSchedule
      ? `Timetable always shown · from ${todaysSchedule.stop} · toward ${todaysSchedule.endPoint} · official DBTSL v${DBTSL_TIMETABLE_VERSION}`
      : "No bundled timetable for this chip";
    if (!live.query) {
      return {
        mode: "schedule" as const,
        text: `${ttHint}. No eta.dbtsl.com query for this chip — seeded stops only. ${geoLabel}`,
      };
    }
    if (live.error && !live.stops) {
      return {
        mode: "schedule" as const,
        text: `${ttHint}. Live ETA feed error — map uses seeded stops. ${geoLabel}`,
      };
    }
    if (buses.length > 0) {
      const tripStatus = formatActiveTripsStatus(buses);
      return {
        mode: "eta-inferred" as const,
        text: `Live on top (eta.dbtsl.com) — ${tripStatus}. Map/board show live overlays · not vehicle GPS${live.agoLabel ? ` · ${live.agoLabel}` : ""}. ${ttHint}. ${geoLabel}`,
      };
    }
    const nextBits = timetableNext
      .slice(0, 3)
      .map((d) => formatScheduledClock(d))
      .join(" · ");
    return {
      mode: "schedule" as const,
      text: `Live feed idle/empty — timetable stays${nextBits ? ` · next ${nextBits}` : ""}. ${ttHint}${live.agoLabel ? ` · ${live.agoLabel}` : ""}. ${geoLabel}`,
    };
  }, [
    live.query,
    live.error,
    live.stops,
    live.agoLabel,
    buses,
    roadSource,
    roadBusy,
    timetableNext,
    todaysSchedule,
  ]);

  const stopList = useMemo(() => {
    if (activeTrip) {
      return activeTrip.upcoming.map((u, i) => ({
        key: `${activeTrip.tripCode}-${u.stopIndex}-${i}`,
        seq: i + 1,
        name: u.name,
        eta: formatEtaLabel({ etaIso: u.etaIso, minutes: u.minutes }),
        highlight: suggestion?.nearestStopIndex === u.stopIndex,
      }));
    }
    // No live trip: full seeded/live shape, no mixed-trip ETAs
    return shapeStops.map((s, i) => ({
      key: `${s.id}-${i}`,
      seq: i + 1,
      name: s.name,
      eta: null as string | null,
      highlight: suggestion?.nearestStopIndex === i,
    }));
  }, [activeTrip, shapeStops, suggestion?.nearestStopIndex]);

  const userPos = geo.position;
  const dirCount = live.queries?.length ?? 0;

  return (
    <section className="db-bus">
      <div className="db-bus-head">
        <div className="db-bus-head-row">
          <h2>DB buses</h2>
          <div className="db-live-controls">
            {live.agoLabel ? (
              <span className="db-updated" aria-live="polite">
                {live.agoLabel}
              </span>
            ) : null}
            <button
              type="button"
              className="db-refresh"
              onClick={live.refresh}
              disabled={!live.query || live.refreshing}
              aria-label="Refresh bus ETAs"
            >
              {live.refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        <p className="note">
          <strong>Timetable-first</strong> (like the official DB app Timetable tab): published
          clock times from Discovery Bay schedule CSVs are always visible, labeled by{" "}
          <strong>From stop</strong> (origin) and direction. When{" "}
          <strong>eta.dbtsl.com</strong> has active trips, a <strong>Live</strong> layer sits on
          top (bus icons, ETAs, C4/C9 column board). If live is empty, the timetable stays — never
          only “no active trip”. Paths snap to <strong>OSRM</strong> roads; icons are ETA-inferred
          (no vehicle GPS). Auto-refresh ~20s; GPS suggests nearest stop.
        </p>
      </div>

      <div className="db-chips">
        {featured.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`db-chip ${r.id === route.id ? "active" : ""} ${r.featured ? "featured" : ""}`}
            onClick={() => setSelectedId(r.id)}
          >
            {r.number}
          </button>
        ))}
      </div>

      {geo.status === "granted" && suggestion ? (
        <div className="db-suggest" role="status">
          <div className="db-suggest-title">{suggestion.summaryLine}</div>
          <ul className="db-suggest-meta">
            <li>
              <strong>Nearest stop:</strong> {suggestion.nearestStopName}
              {suggestion.walkMins != null ? (
                <span>
                  {" "}
                  · ~{suggestion.walkMins} min walk ({suggestion.walkMeters} m)
                </span>
              ) : null}
            </li>
            <li>
              <strong>Next ETA there:</strong>{" "}
              {suggestion.etaAtNearest ?? "— (bus may have passed / no trip ETA)"}
            </li>
            <li>
              <strong>Bus heading:</strong>{" "}
              {suggestion.busHeadingLabel
                ? suggestion.busHeadingLabel
                : activeTrip
                  ? `trip ${activeTrip.plate} toward ${activeTrip.upcoming[0]?.name ?? "next stop"}`
                  : todaysSchedule
                    ? "No live bus right now — see timetable below"
                    : "No active trip right now"}
            </li>
          </ul>
          {activeTrip ? (
            <p className="note db-suggest-trip">
              Stop list focused on trip {activeTrip.plate}
              {buses.length > 1
                ? ` — map shows all ${buses.length} active buses`
                : ""}
              .
            </p>
          ) : null}
        </div>
      ) : (
        <div className="db-suggest db-suggest-muted">
          {geo.status === "prompting" || geo.status === "idle" ? (
            <p className="note">Getting your location for stop suggestions…</p>
          ) : (
            <>
              <p className="note">
                {geo.status === "denied"
                  ? "Location permission denied — enable it to get nearest-stop suggestions."
                  : "Location unavailable — enable it to get nearest-stop suggestions."}
              </p>
              <button type="button" className="db-loc-btn" onClick={geo.retry}>
                Enable location for suggestions
              </button>
            </>
          )}
          {activeTrip ? (
            <p className="note db-suggest-trip">
              Stop list focused on trip {activeTrip.plate}
              {buses.length > 1
                ? ` — map shows all ${buses.length} active buses`
                : " (nearest active)"}
              .
            </p>
          ) : null}
        </div>
      )}

      <div className="db-route-card">
        <div className="option-top">
          <strong>
            {route.number} · {route.name}
          </strong>
          <span className={`pill pill-${headerPill.kind}`}>{headerPill.text}</span>
        </div>
        {route.nameZh && <p className="zh-line">{route.nameZh}</p>}
        <p className="note">{route.summary}</p>
        <p className="note">~HK${route.fareHkd.toFixed(1)} adult Octopus (est.)</p>
        <div className={`db-track-banner ${statusBanner.mode}`}>
          <span>{statusBanner.text}</span>
        </div>
        {buses.length > 0 ? (
          <div className="db-live-layer" role="status">
            <div className="db-live-layer-title">Live · eta.dbtsl.com</div>
            <p className="note db-timetable-note">
              Active trips overlay — map icons + board below. Timetable remains underneath.
            </p>
            <ul className="db-live-list">
              {buses.map((bus) => (
                <li key={bus.id}>
                  <span className="db-live-plate">{bus.label}</span>
                  <span className="db-live-eta">
                    {bus.etaMinutes <= 0 ? "Due" : `${bus.etaMinutes} min`}
                  </span>
                  <span className="db-live-tag">live</span>
                  {bus.nextStopName ? (
                    <span className="db-live-next">→ {bus.nextStopName}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {todaysSchedule ? (
          <div
            className="db-timetable"
            role="region"
            aria-label={`Published timetable from ${todaysSchedule.stop}`}
          >
            <div className="db-timetable-origin">
              <div className="db-timetable-origin-main">
                {formatDeparturesFromHeadline(todaysSchedule)}
              </div>
              <div className="db-timetable-origin-dir">
                Route {route.number} toward {todaysSchedule.endPoint}
              </div>
              <div className="db-timetable-origin-meta">
                {todaysSchedule.dayLabel}
                {todaysSchedule.published ? " · published CSV" : " · approx. village"}
                {" · "}official DBTSL v{DBTSL_TIMETABLE_VERSION}
              </div>
            </div>
            {fromStops.length > 1 ? (
              <div className="db-tt-from">
                <label className="db-tt-from-label" htmlFor="db-tt-from-select">
                  From stop
                </label>
                <div className="db-tt-from-chips" role="group" aria-label="Timetable from stop">
                  {fromStops.map((fs) => (
                    <button
                      key={fs.id}
                      type="button"
                      className={`db-tt-from-chip${fromStopId === fs.id ? " active" : ""}${fs.published ? "" : " approx"}`}
                      onClick={() => setFromStopId(fs.id)}
                      aria-pressed={fromStopId === fs.id}
                      title={
                        fs.published
                          ? `Published departures from ${fs.stop}`
                          : (fs.note ?? `Approximate departures from ${fs.stop}`)
                      }
                    >
                      {fs.label}
                      {!fs.published ? " ≈" : ""}
                    </button>
                  ))}
                </div>
                <select
                  id="db-tt-from-select"
                  className="db-tt-from-select"
                  value={fromStopId ?? fromStops[0]?.id ?? ""}
                  onChange={(e) => setFromStopId(e.target.value)}
                  aria-label="From stop"
                >
                  {fromStops.map((fs) => (
                    <option key={fs.id} value={fs.id}>
                      {fs.label}
                      {fs.published ? "" : " (approx)"} — {fs.stop}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="note db-timetable-note">
                Official schedule is keyed by this terminus From (CSV has no other From for this
                route).
              </p>
            )}
            <p className="note db-timetable-note">
              {todaysSchedule.published
                ? "Published schedule (not live ETA)"
                : "Approximate schedule from official village offset (not a separate CSV table)"}
              {buses.length > 0
                ? " · shown under live overlay"
                : " · live feed idle — schedule stays visible"}
              .
              {todaysSchedule.originNote ? ` ${todaysSchedule.originNote}` : ""}
            </p>
            {timetableNext.length > 0 ? (
              <>
                <div className="db-timetable-subtitle">
                  Bus leaves {todaysSchedule.fromLabel} at…
                </div>
                <ul className="db-timetable-list">
                  {timetableNext.map((dep) => (
                    <li key={`${dep.tomorrow ? "t" : "d"}-${dep.time}`}>
                      <span className="db-timetable-clock">
                        {formatScheduledClock(dep)}
                      </span>
                      <span className="db-timetable-tag">timetable</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <div className="db-timetable-subtitle">
              Today · hours / minutes from {todaysSchedule.fromLabel}
            </div>
            <div
              className="db-tt-grid"
              role="table"
              aria-label={`Timetable hour grid from ${todaysSchedule.stop}`}
            >
              {todaysSchedule.byHour.map((row) => {
                const isCurrentHour = row.hour === hkNow.hour;
                return (
                  <div
                    key={row.hour}
                    className={`db-tt-row${row.allPast ? " past" : ""}${isCurrentHour ? " current" : ""}`}
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
                          !past &&
                          timetableNext[0] &&
                          !timetableNext[0].tomorrow &&
                          timetableNext[0].time === clock;
                        return (
                          <span
                            key={`${clock}-${mm}`}
                            className={`db-tt-min${past ? " past" : ""}${isNext ? " next" : ""}`}
                            title={`Bus leaves ${todaysSchedule.fromLabel} at ${clock}`}
                          >
                            {mm}
                          </span>
                        );
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        {live.error && <p className="note">{live.error}</p>}
        {dirCount > 1 ? (
          <p className="note">
            Polling {dirCount} destination/variants from get_bus_routes
            {live.directions
              ? `: ${live.directions.map((d) => d.destLabel).join(" · ")}`
              : ""}
            .
          </p>
        ) : null}
        <p className="note">{route.trackingNote}</p>
      </div>

      <div className="map-wrap db-map-wrap">
        <MapContainer
          center={DB_MAP_CENTER}
          zoom={DB_MAP_ZOOM}
          className="map"
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitDb points={shapeStops} user={userPos} />
          <Polyline
            positions={line}
            pathOptions={{
              color: roadSource === "stop-chords" ? "#a67c52" : "#c45c26",
              weight: 5,
              opacity: 0.9,
              dashArray: roadSource === "stop-chords" ? "8 10" : undefined,
            }}
          />
          {shapeStops.map((stop, i) => {
            const isNear = suggestion?.nearestStopIndex === i;
            const isDest = suggestion?.destStopIndex === i;
            return (
              <CircleMarker
                key={`${stop.id}-${i}`}
                center={[stop.lat, stop.lng]}
                radius={isNear || isDest || i === 0 || i === shapeStops.length - 1 ? 8 : 5}
                pathOptions={{
                  color: isNear
                    ? "#1a4f7a"
                    : isDest
                      ? "#6b3fa0"
                      : i === 0
                        ? "#1d6f42"
                        : i === shapeStops.length - 1
                          ? "#8b1e1e"
                          : "#c45c26",
                  fillColor: isNear
                    ? "#3d8bfd"
                    : isDest
                      ? "#9b6dde"
                      : i === 0
                        ? "#27ae60"
                        : i === shapeStops.length - 1
                          ? "#c0392b"
                          : "#f3e0d2",
                  fillOpacity: 1,
                }}
              >
                <Popup>
                  <strong>
                    {route.number} stop {i + 1}
                    {isNear ? " · nearest to you" : ""}
                    {isDest ? " · suggested toward" : ""}
                  </strong>
                  <br />
                  {stop.name}
                  {stop.nameZh ? ` · ${stop.nameZh}` : ""}
                </Popup>
              </CircleMarker>
            );
          })}
          {buses.map((bus) => (
            <Marker
              key={bus.id}
              position={[bus.lat, bus.lng]}
              icon={busIcon(bus.heading ?? 0, bus.label)}
              opacity={1}
              zIndexOffset={
                activeTrip && bus.id === `dbtsl-${activeTrip.tripCode}` ? 600 : 500
              }
            >
              <Popup>
                <strong>{route.number} · ETA-inferred</strong>
                {bus.destinationLabel ? ` · → ${bus.destinationLabel}` : ""}
                <br />
                {bus.label}
                <br />
                {bus.nextStopName ? (
                  <>
                    Next: {bus.nextStopName}
                    <br />
                  </>
                ) : null}
                {bus.heading != null ? (
                  <>
                    Heading ≈ {Math.round(bus.heading)}° (along road)
                    <br />
                  </>
                ) : null}
                <em>Not Live GPS — position from eta.dbtsl.com next-stop ETA on road path</em>
              </Popup>
            </Marker>
          ))}
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

      <BusColumnBoard routeNumber={route.number} />

      <div className="db-stop-list-head">
        <h3>
          {activeTrip
            ? `Upcoming · trip ${activeTrip.plate}`
            : todaysSchedule
              ? "Stops (route shape — departures in Timetable above)"
              : "Stops"}
        </h3>
        {buses.length > 1 ? (
          <span className="note">
            {formatActiveTripsStatus(buses)} — stop list focuses nearest/suggested; map shows
            all
          </span>
        ) : null}
      </div>
      <ol className="db-stop-list">
        {stopList.map((row) => (
          <li key={row.key} className={row.highlight ? "near-you" : undefined}>
            <span className="seq">{row.seq}</span>
            <span>
              {row.name}
              {row.highlight ? <span className="db-near-tag"> · near you</span> : null}
              {row.eta ? <span className="db-eta-chip"> · {row.eta}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
