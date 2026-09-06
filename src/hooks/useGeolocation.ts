import { useCallback, useEffect, useRef, useState } from "react";

export type GeoStatus = "idle" | "prompting" | "granted" | "denied" | "unavailable";

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracyM: number | null;
  updatedAtMs: number;
}

/**
 * Browser Geolocation for the DB buses tab.
 * Only user GPS — never invents bus positions.
 */
export function useGeolocation(enabled: boolean) {
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  const clearWatch = useCallback(() => {
    if (watchId.current != null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      setError("Location not supported on this browser");
      return;
    }
    setStatus("prompting");
    setError(null);
    clearWatch();
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus("granted");
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          updatedAtMs: pos.timestamp || Date.now(),
        });
        setError(null);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus("denied");
          setError("Location permission denied");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setStatus("unavailable");
          setError("Location unavailable");
        } else {
          setStatus("unavailable");
          setError(err.message || "Location timed out");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 20_000,
      },
    );
  }, [clearWatch]);

  useEffect(() => {
    if (!enabled) {
      clearWatch();
      return;
    }
    start();
    return clearWatch;
  }, [enabled, start, clearWatch]);

  return { status, position, error, retry: start };
}
