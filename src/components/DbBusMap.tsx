import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
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
  inferDbtslBusesFromStops,
  type DbtslStopEta,
} from "../api/dbtslEta";
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

function useDbtslLive(routeNumber: string) {
  const query = DBTSL_ETA_QUERIES[routeNumber];
  const [stops, setStops] = useState<DbtslStopEta[] | null>(null);
  const [buses, setBuses] = useState<InferredBus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!query) {
      setStops(null);
      setBuses([]);
      setError(null);
      setUpdatedAt(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await fetchDbtslBusStops(query);
        if (cancelled) return;
        setStops(rows);
        setBuses(inferDbtslBusesFromStops(rows));
        setError(null);
        setUpdatedAt(new Date().toLocaleTimeString("en-HK", { hour12: false }));
      } catch (e) {
        if (cancelled) return;
        console.warn("DBTSL ETA fetch failed", e);
        setError("ETA feed unavailable");
      }
    };
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [query]);

  return { query, stops, buses, error, updatedAt };
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

  const line = useMemo(
    () => shapeStops.map((s) => [s.lat, s.lng] as [number, number]),
    [shapeStops],
  );

  const trackingMode =
    live.query && live.buses.length > 0
      ? "eta-inferred"
      : live.query
        ? route.trackingMode === "schedule"
          ? "eta-inferred"
          : route.trackingMode
        : route.trackingMode;

  return (
    <section className="db-bus">
      <div className="db-bus-head">
        <h2>DB buses</h2>
        <p className="note">
          Discovery Bay internal routes — zoomed to DB. Bus dots use the official{" "}
          <strong>eta.dbtsl.com</strong> stop-ETA feed (same as the Discovery Bay app WebView).
          There is <strong>no vehicle GPS endpoint</strong> — dots are ETA-inferred at the next
          stop, never labeled Live GPS.
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
              Live ETA (eta.dbtsl.com) — {live.buses.length} active trip
              {live.buses.length === 1 ? "" : "s"}. Dots at next stop · not vehicle GPS
              {live.updatedAt ? ` · ${live.updatedAt}` : ""}
            </span>
          ) : (
            <span>Schedule only — no live ETA for this route right now. No fake bus dots.</span>
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
          {live.buses.map((bus) => (
            <CircleMarker
              key={bus.id}
              center={[bus.lat, bus.lng]}
              radius={11}
              pathOptions={{
                color: "#1a4f7a",
                fillColor: "#3d8bfd",
                fillOpacity: 0.95,
                weight: 3,
              }}
            >
              <Popup>
                <strong>{route.number} · ETA-inferred</strong>
                <br />
                {bus.label}
                <br />
                <em>Not Live GPS — next-stop position from eta.dbtsl.com</em>
              </Popup>
            </CircleMarker>
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
