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
import { DB_BUS_ROUTES, DB_MAP_CENTER, DB_MAP_ZOOM, type DbBusRoute } from "../data/dbBuses";

function FitDb({ route }: { route: DbBusRoute | null }) {
  const map = useMap();
  useEffect(() => {
    if (!route || route.stops.length < 2) {
      map.setView(DB_MAP_CENTER, DB_MAP_ZOOM);
      return;
    }
    const bounds = L.latLngBounds(route.stops.map((s) => [s.lat, s.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
  }, [map, route]);
  return null;
}

export function DbBusMap() {
  const featured = useMemo(
    () => DB_BUS_ROUTES.filter((r) => r.featured).concat(DB_BUS_ROUTES.filter((r) => !r.featured)),
    [],
  );
  const [selectedId, setSelectedId] = useState<string>("db-c4");
  const route = featured.find((r) => r.id === selectedId) ?? featured[0];

  const line = useMemo(
    () => route.stops.map((s) => [s.lat, s.lng] as [number, number]),
    [route],
  );

  return (
    <section className="db-bus">
      <div className="db-bus-head">
        <h2>DB buses</h2>
        <p className="note">
          Discovery Bay internal routes — zoomed to DB. Live GPS is only shown when an open
          operator feed exists (none published for DBTSL today).
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
        <div className={`db-track-banner ${route.trackingMode}`}>
          {route.trackingMode === "live-gps" ? (
            <span>Live GPS · heading from operator feed</span>
          ) : route.trackingMode === "eta-inferred" ? (
            <span>ETA-inferred — no live GPS. Positions along stops from ETA only.</span>
          ) : (
            <span>Schedule only — no live GPS / open ETA for DBTSL. No fake bus dots.</span>
          )}
        </div>
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
          <FitDb route={route} />
          <Polyline
            positions={line}
            pathOptions={{ color: "#c45c26", weight: 5, opacity: 0.9 }}
          />
          {route.stops.map((stop, i) => (
            <CircleMarker
              key={`${stop.id}-${i}`}
              center={[stop.lat, stop.lng]}
              radius={i === 0 || i === route.stops.length - 1 ? 8 : 5}
              pathOptions={{
                color: i === 0 ? "#1d6f42" : i === route.stops.length - 1 ? "#8b1e1e" : "#c45c26",
                fillColor: i === 0 ? "#27ae60" : i === route.stops.length - 1 ? "#c0392b" : "#f3e0d2",
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
        </MapContainer>
      </div>

      <ol className="db-stop-list">
        {route.stops.map((stop, i) => (
          <li key={`${stop.id}-${i}`}>
            <span className="seq">{i + 1}</span>
            <span>
              {stop.name}
              {stop.nameZh ? ` · ${stop.nameZh}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
