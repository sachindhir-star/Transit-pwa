import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  DBTSL_ETA_QUERIES,
  dbtslStopsToPoints,
  fetchDbtslBusStops,
  inferDbtslBusesOnRoad,
  type DbtslStopEta,
} from "../api/dbtslEta";
import { snapStopsToRoads, type LatLng } from "../api/roadGeometry";
import { formatEtaLabel } from "../lib/formatEta";
import type { InferredBus, StopPoint } from "../types";

const POLL_MS = 20_000;

function FitDb({ points }: { points: StopPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) {
      map.setView(DB_MAP_CENTER, DB_MAP_ZOOM);
      return;
    }
    const bounds = L.latLngBounds(points.map((s) => [s.lat, s.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
  }, [map, points]);
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

function formatAgo(updatedAtMs: number | null, nowMs: number): string {
  if (updatedAtMs == null) return "";
  const sec = Math.max(0, Math.floor((nowMs - updatedAtMs) / 1000));
  if (sec < 3) return "Updated just now";
  if (sec < 60) return `Updated ${sec}s ago`;
  const min = Math.floor(sec / 60);
  return `Updated ${min}m ago`;
}

function useDbtslLive(routeNumber: string) {
  const query = DBTSL_ETA_QUERIES[routeNumber];
  const [stops, setStops] = useState<DbtslStopEta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAtMs, setUpdatedAtMs] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(() => Date.now());
  const gen = useRef(0);

  const load = useCallback(async (manual = false) => {
    if (!query) {
      setStops(null);
      setError(null);
      setUpdatedAtMs(null);
      return;
    }
    const my = ++gen.current;
    if (manual) setRefreshing(true);
    try {
      const rows = await fetchDbtslBusStops(query);
      if (my !== gen.current) return;
      setStops(rows);
      setError(null);
      setUpdatedAtMs(Date.now());
    } catch (e) {
      if (my !== gen.current) return;
      console.warn("DBTSL ETA fetch failed", e);
      setError("ETA feed unavailable");
    } finally {
      if (my === gen.current && manual) setRefreshing(false);
    }
  }, [query]);

  useEffect(() => {
    void load(false);
    const id = window.setInterval(() => void load(false), POLL_MS);
    return () => {
      gen.current += 1;
      window.clearInterval(id);
    };
  }, [load]);

  // Tick relative "Updated Xs ago" without refetching
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const agoLabel = formatAgo(updatedAtMs, tick);

  return {
    query,
    stops,
    error,
    updatedAtMs,
    agoLabel,
    refreshing,
    refresh: () => void load(true),
  };
}

export function DbBusMap() {
  const featured = useMemo(
    () => DB_BUS_ROUTES.filter((r) => r.featured).concat(DB_BUS_ROUTES.filter((r) => !r.featured)),
    [],
  );
  const [selectedId, setSelectedId] = useState<string>("db-c4");
  const route = featured.find((r) => r.id === selectedId) ?? featured[0];
  const live = useDbtslLive(route.number);

  const shapeStops: StopPoint[] = useMemo(() => {
    if (live.stops && live.stops.length >= 2) return dbtslStopsToPoints(live.stops);
    return route.stops;
  }, [live.stops, route.stops]);

  const [roadLine, setRoadLine] = useState<LatLng[]>([]);
  const [roadBusy, setRoadBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRoadBusy(true);
    void (async () => {
      try {
        const snapped = await snapStopsToRoads(shapeStops);
        if (cancelled) return;
        setRoadLine(snapped.length >= 2 ? snapped : shapeStops);
      } catch (e) {
        console.warn("DB OSRM snap failed", e);
        if (!cancelled) setRoadLine(shapeStops);
      } finally {
        if (!cancelled) setRoadBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shapeStops]);

  const line = useMemo(
    () => (roadLine.length >= 2 ? roadLine : shapeStops).map((s) => [s.lat, s.lng] as [number, number]),
    [roadLine, shapeStops],
  );

  const buses: InferredBus[] = useMemo(() => {
    if (!live.stops?.length) return [];
    const road = roadLine.length >= 2 ? roadLine : shapeStops;
    return inferDbtslBusesOnRoad(live.stops, road);
  }, [live.stops, roadLine, shapeStops]);

  const trackingMode =
    live.query && buses.length > 0
      ? "eta-inferred"
      : live.query
        ? route.trackingMode === "schedule"
          ? "eta-inferred"
          : route.trackingMode
        : route.trackingMode;

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
          Discovery Bay internal routes — zoomed to DB. Bus icons use the official{" "}
          <strong>eta.dbtsl.com</strong> stop-ETA feed (same as the Discovery Bay app WebView).
          There is <strong>no vehicle GPS endpoint</strong> — icons are ETA-inferred along the
          road toward the next stop, never labeled Live GPS. Auto-refreshes every 20s.
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
        <div className={`db-track-banner ${trackingMode}`}>
          {trackingMode === "live-gps" ? (
            <span>Live GPS · heading from operator feed</span>
          ) : trackingMode === "eta-inferred" ? (
            <span>
              Live ETA (eta.dbtsl.com) — {buses.length} active trip
              {buses.length === 1 ? "" : "s"}. Icon on road · heading to next stop · not vehicle
              GPS
              {live.agoLabel ? ` · ${live.agoLabel}` : ""}
              {roadBusy ? " · snapping route…" : ""}
            </span>
          ) : (
            <span>Schedule only — no live ETA for this route right now. No fake bus icons.</span>
          )}
        </div>
        {live.error && <p className="note">{live.error}</p>}
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
          <FitDb points={shapeStops} />
          <Polyline
            positions={line}
            pathOptions={{ color: "#c45c26", weight: 5, opacity: 0.9 }}
          />
          {shapeStops.map((stop, i) => (
            <CircleMarker
              key={`${stop.id}-${i}`}
              center={[stop.lat, stop.lng]}
              radius={i === 0 || i === shapeStops.length - 1 ? 8 : 5}
              pathOptions={{
                color: i === 0 ? "#1d6f42" : i === shapeStops.length - 1 ? "#8b1e1e" : "#c45c26",
                fillColor:
                  i === 0 ? "#27ae60" : i === shapeStops.length - 1 ? "#c0392b" : "#f3e0d2",
                fillOpacity: 1,
              }}
            >
              <Popup>
                <strong>
                  {route.number} stop {i + 1}
                </strong>
                <br />
                {stop.name}
                {stop.nameZh ? ` · ${stop.nameZh}` : ""}
              </Popup>
            </CircleMarker>
          ))}
          {buses.map((bus) => (
            <Marker
              key={bus.id}
              position={[bus.lat, bus.lng]}
              icon={busIcon(bus.heading ?? 0, bus.label)}
            >
              <Popup>
                <strong>{route.number} · ETA-inferred</strong>
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
        </MapContainer>
      </div>

      <ol className="db-stop-list">
        {(live.stops ?? route.stops.map((s) => ({
          stop: s.name,
          info: [] as string[],
          time: [] as string[],
          trip_code: [] as string[],
          latitude: s.lat,
          longitude: s.lng,
          people_cnt: 0,
        }))).map((stop, i) => {
          const eta =
            formatEtaLabel({ etaIso: stop.time?.[0] ?? null }) ??
            stop.info?.[0] ??
            null;
          return (
            <li key={`${stop.stop}-${i}`}>
              <span className="seq">{i + 1}</span>
              <span>
                {stop.stop}
                {eta ? (
                  <span className="db-eta-chip"> · {eta}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
