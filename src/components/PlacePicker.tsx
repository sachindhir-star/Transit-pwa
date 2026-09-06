import { useEffect, useMemo, useRef, useState } from "react";
import { hitToPlace, searchRemotePlaces, type GeocodeHit } from "../api/geocode";
import { PLACES, searchPlaces } from "../data/places";
import type { Place } from "../types";

interface Props {
  label: string;
  value: Place | null;
  onChange: (p: Place) => void;
  excludeId?: string;
}

type Row =
  | { kind: "curated"; place: Place }
  | { kind: "remote"; hit: GeocodeHit };

export function PlacePicker({ label, value, onChange, excludeId }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<GeocodeHit[]>([]);
  const [remoteStatus, setRemoteStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const reqRef = useRef(0);

  const curated = useMemo(() => {
    const list = (q.trim() ? searchPlaces(q) : PLACES).filter((p) => p.id !== excludeId);
    return list.slice(0, 8);
  }, [q, excludeId]);

  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (query.length < 2) {
      setRemote([]);
      setRemoteStatus("idle");
      return;
    }
    const id = ++reqRef.current;
    setRemoteStatus("loading");
    const t = window.setTimeout(() => {
      searchRemotePlaces(query)
        .then((hits) => {
          if (reqRef.current !== id) return;
          setRemote(hits);
          setRemoteStatus("done");
        })
        .catch(() => {
          if (reqRef.current !== id) return;
          setRemote([]);
          setRemoteStatus("error");
        });
    }, 280);
    return () => window.clearTimeout(t);
  }, [q, open]);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = curated.map((place) => ({ kind: "curated", place }));
    for (const hit of remote) {
      if (excludeId && hit.id === excludeId) continue;
      // skip remote that duplicates a curated place (~80m)
      const dup = curated.some((p) => {
        const dlat = (p.lat - hit.lat) * 111_320;
        const dlng = (p.lng - hit.lng) * 111_320 * Math.cos((p.lat * Math.PI) / 180);
        return Math.hypot(dlat, dlng) < 80;
      });
      if (dup) continue;
      out.push({ kind: "remote", hit });
    }
    return out.slice(0, 14);
  }, [curated, remote, excludeId]);

  const pick = (p: Place) => {
    onChange(p);
    setOpen(false);
    setQ("");
    setRemote([]);
  };

  return (
    <div className="picker">
      <label className="picker-label">{label}</label>
      <button
        type="button"
        className="picker-value"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{value ? value.name : "Search address or place"}</span>
        {value?.nameZh && <span className="zh">{value.nameZh}</span>}
      </button>
      {open && (
        <div className="picker-dropdown">
          <input
            className="picker-search"
            placeholder="Shop, restaurant, mall, address…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          {remoteStatus === "loading" && (
            <p className="picker-hint">Searching places & addresses…</p>
          )}
          {remoteStatus === "error" && (
            <p className="picker-hint">Remote search failed — curated places still work.</p>
          )}
          <ul>
            {rows.map((row) => {
              if (row.kind === "curated") {
                const p = row.place;
                return (
                  <li key={`c-${p.id}`}>
                    <button type="button" onClick={() => pick(p)}>
                      <strong>{p.name}</strong>
                      <span className="meta">
                        Shortcut · {p.area}
                        {p.nameZh ? ` · ${p.nameZh}` : ""}
                      </span>
                    </button>
                  </li>
                );
              }
              const h = row.hit;
              return (
                <li key={`r-${h.id}`}>
                  <button type="button" onClick={() => pick(hitToPlace(h))}>
                    <strong>{h.name}</strong>
                    <span className="meta">
                      {h.source === "als"
                        ? "HK address"
                        : h.source === "overpass"
                          ? "OSM POI"
                          : "OpenStreetMap"}{" "}
                      · {h.areaLabel}
                      {h.nameZh ? ` · ${h.nameZh}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
            {!rows.length && q.trim().length >= 2 && remoteStatus === "done" && (
              <li className="picker-empty">No matches — try a shop name, mall, or street address.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
