import { useEffect, useMemo } from "react";
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
import { inferBusesFromEta } from "../lib/inferBus";
import type { InferredBus, LiveEta, TripOption } from "../types";

const busIcon = (label: string) =>
  L.divIcon({
    className: "bus-dot-icon",
    html: `<div class="bus-dot" title="${label}"><span></span></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length < 2) {
      if (positions.length === 1) map.setView(positions[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(positions), { padding: [40, 40] });
  }, [map, positions]);
  return null;
}

interface Props {
  trip: TripOption;
  etas: LiveEta[];
  etaStatus: string;
  etaError: string | null;
  activeLegIndex: number;
}

export function RouteMap({ trip, etas, etaStatus, etaError, activeLegIndex }: Props) {
  const leg = trip.legs[activeLegIndex] ?? trip.legs[0];
  const shape = leg?.shape ?? [];
  const line = useMemo(
    () => shape.map((s) => [s.lat, s.lng] as [number, number]),
    [shape],
  );
  const allPoints = useMemo(() => {
    return trip.legs.flatMap((l) => l.shape.map((s) => [s.lat, s.lng] as [number, number]));
  }, [trip]);

  const buses: InferredBus[] = useMemo(() => {
    if (leg?.trackingMode !== "live-eta") return [];
    return inferBusesFromEta(shape, etas);
  }, [leg, shape, etas]);

  return (
    <section className="map-panel">
      <div className="map-banner">
        {leg?.trackingMode === "live-eta" ? (
          etaStatus === "live" ? (
            <span className="banner live">
              Live ETA feed · dots are <strong>ETA-inferred</strong> (not GPS)
            </span>
          ) : etaStatus === "loading" ? (
            <span className="banner">Fetching operator ETA…</span>
          ) : (
            <span className="banner warn">
              ETA unavailable{etaError ? ` — ${etaError}` : ""}. No fake live dots.
            </span>
          )
        ) : leg?.trackingMode === "schedule" ? (
          <span className="banner warn">
            Schedule / curated corridor — no live vehicle GPS for this operator leg
          </span>
        ) : leg?.trackingMode === "mtr-hint" ? (
          <span className="banner">MTR connecting hint — not live train positions</span>
        ) : (
          <span className="banner">Walking leg</span>
        )}
      </div>
      <div className="map-wrap">
        <MapContainer
          center={line[0] ?? [22.3, 114.05]}
          zoom={12}
          className="map"
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CARTO'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          <FitBounds positions={allPoints.length ? allPoints : line} />
          {trip.legs.map((l, idx) => (
            <Polyline
              key={idx}
              positions={l.shape.map((s) => [s.lat, s.lng] as [number, number])}
              pathOptions={{
                color: idx === activeLegIndex ? "#c45c26" : "#a38b78",
                weight: idx === activeLegIndex ? 5 : 3,
                opacity: idx === activeLegIndex ? 0.95 : 0.45,
              }}
            />
          ))}
          {shape[0] && (
            <CircleMarker
              center={[shape[0].lat, shape[0].lng]}
              radius={8}
              pathOptions={{ color: "#1d6f42", fillColor: "#27ae60", fillOpacity: 1 }}
            >
              <Popup>Board: {leg.fromStop.name}</Popup>
            </CircleMarker>
          )}
          {shape[shape.length - 1] && (
            <CircleMarker
              center={[shape[shape.length - 1].lat, shape[shape.length - 1].lng]}
              radius={8}
              pathOptions={{ color: "#8b1e1e", fillColor: "#c0392b", fillOpacity: 1 }}
            >
              <Popup>Alight: {leg.toStop.name}</Popup>
            </CircleMarker>
          )}
          {buses.map((b) => (
            <Marker key={b.id} position={[b.lat, b.lng]} icon={busIcon(b.label)}>
              <Popup>
                <strong>ETA-inferred position</strong>
                <br />
                Next stop ETA ≈ {b.etaMinutes} min
                <br />
                <em>Not a GPS fix — placed from ETA along route shape.</em>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      {etas.length > 0 && (
        <ul className="eta-list">
          {etas.slice(0, 3).map((e, i) => (
            <li key={i}>
              <strong>{e.minutes != null ? `${e.minutes} min` : "—"}</strong>
              <span> → {e.dest || "destination"}</span>
              {e.remark ? <span className="rmk"> · {e.remark}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
