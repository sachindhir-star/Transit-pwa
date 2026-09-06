import type { TripOption } from "../types";

interface Props {
  options: TripOption[];
  selectedId: string | null;
  onSelect: (opt: TripOption) => void;
}

export function TripOptions({ options, selectedId, onSelect }: Props) {
  if (!options.length) {
    return <p className="empty">Pick From and To to see routes.</p>;
  }
  return (
    <section className="options">
      <h2>Options</h2>
      <ul className="option-list">
        {options.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              className={`option-card ${selectedId === o.id ? "selected" : ""}`}
              onClick={() => onSelect(o)}
            >
              <div className="option-top">
                <strong>{o.summary}</strong>
                <span className="pill">{o.totalMin} min</span>
              </div>
              <div className="option-meta">
                <span>~HK${o.totalFareHkd.toFixed(1)} adult Octopus (est.)</span>
                {o.tags?.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
              <ol className="leg-brief">
                {o.legs.map((leg, i) => (
                  <li key={i}>
                    <span className={`mode mode-${leg.mode}`}>{leg.mode}</span>
                    {leg.route ? ` ${leg.route}` : ""} · {leg.fromStop.name} → {leg.toStop.name}
                    <span className="track"> · {leg.trackingMode}</span>
                  </li>
                ))}
              </ol>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
