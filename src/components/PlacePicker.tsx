import { useMemo, useState } from "react";
import { PLACES, searchPlaces } from "../data/places";
import type { Place } from "../types";

interface Props {
  label: string;
  value: Place | null;
  onChange: (p: Place) => void;
  excludeId?: string;
}

export function PlacePicker({ label, value, onChange, excludeId }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    return searchPlaces(q).filter((p) => p.id !== excludeId).slice(0, 12);
  }, [q, excludeId]);

  return (
    <div className="picker">
      <label className="picker-label">{label}</label>
      <button
        type="button"
        className="picker-value"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{value ? value.name : "Choose place"}</span>
        {value?.nameZh && <span className="zh">{value.nameZh}</span>}
      </button>
      {open && (
        <div className="picker-dropdown">
          <input
            className="picker-search"
            placeholder="Search DB, Central, Sunny Bay…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <ul>
            {(q ? results : PLACES.filter((p) => p.id !== excludeId).slice(0, 12)).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(p);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <strong>{p.name}</strong>
                  <span className="meta">
                    {p.area}
                    {p.nameZh ? ` · ${p.nameZh}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
