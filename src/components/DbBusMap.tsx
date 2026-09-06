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
  const route = featured.find((r) => r.id === selectedId) ?? featured[0];
  const live = useDbtslLive(route.number);
  const geo = useGeolocation(true);

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
    if (!live.query) {
      return {
        mode: "schedule" as const,
        text: `Schedule / seeded stops only — no eta.dbtsl.com query for this chip. ${geoLabel}`,
      };
    }
    if (live.error && !live.stops) {
      return {
        mode: "schedule" as const,
        text: `ETA feed error — using seeded stops. ${geoLabel}`,
      };
    }
    if (buses.length > 0) {
      const tripStatus = formatActiveTripsStatus(buses);
      return {
        mode: "eta-inferred" as const,
        text: `Live stop ETAs (eta.dbtsl.com) — ${tripStatus}. Map shows all buses across directions · heading to next stop · not vehicle GPS${live.agoLabel ? ` · ${live.agoLabel}` : ""}. ${geoLabel}`,
      };
    }
    return {
      mode: "eta-inferred" as const,
      text: `Live stop ETAs available from eta.dbtsl.com — no active trip right now (off-peak / overnight gaps are normal). ${geoLabel}${live.agoLabel ? ` · ${live.agoLabel}` : ""}`,
    };
  }, [live.query, live.error, live.stops, live.agoLabel, buses, roadSource, roadBusy]);

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
          Discovery Bay internal + external DBTSL routes (C4/C9/6, DB01R/DB02R…). Paths snap
          consecutive operator stops to <strong>OSRM driving roads</strong> — not stop-to-stop
          chords. Bus icons use <strong>eta.dbtsl.com</strong> stop ETAs (no vehicle GPS). Bidirectional
          routes poll <strong>all destinations</strong> and show every active bus on the map.
          Below the map, selecting <strong>C4</strong> or <strong>C9</strong> shows that route&apos;s
          column board (one column per active bus, all stops in route order). Auto-refreshes every 20s. Your GPS
          suggests nearest stop + likely direction.
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
          <span className="pill">~{route.headwayMin} min</span>
        </div>
        {route.nameZh && <p className="zh-line">{route.nameZh}</p>}
        <p className="note">{route.summary}</p>
        <p className="note">~HK${route.fareHkd.toFixed(1)} adult Octopus (est.)</p>
        <div className={`db-track-banner ${statusBanner.mode}`}>
          <span>{statusBanner.text}</span>
        </div>
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
            : "Stops (no active trip ETAs)"}
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
