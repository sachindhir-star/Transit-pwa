import { useOptionBoardSnippets } from "../hooks/useLiveEta";
import { shortStopName } from "../lib/stopLabel";
import type { TripOption } from "../types";

interface Props {
  options: TripOption[];
  selectedId: string | null;
  onSelect: (opt: TripOption) => void;
}

function firstBusBoard(opt: TripOption): { name: string; route?: string } | null {
  const bus = opt.legs.find((l) => l.mode === "CTB" || l.mode === "KMB" || l.mode === "DB");
  if (!bus) return null;
  return { name: bus.fromStop.name, route: bus.route };
}

export function TripOptions({ options, selectedId, onSelect }: Props) {
  const snippets = useOptionBoardSnippets(options, { limit: 6, pollMs: 60_000 });

  if (!options.length) {
    return <p className="empty">Pick From and To to see routes.</p>;
  }
  return (
    <section className="options">
      <h2>Options</h2>
      <ul className="option-list">
        {options.map((o) => {
          const board = firstBusBoard(o);
          const snip = snippets[o.id];
          const boardLabel = snip?.boardName ?? board?.name;
          return (
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
                {boardLabel ? (
                  <div className="option-depart">
                    <span className="option-board">
                      Board {shortStopName(boardLabel)}
                      {snip?.route || board?.route ? ` · ${snip?.route ?? board?.route}` : ""}
                    </span>
                    {snip?.etaLabel ? (
                      <span className="option-eta">Next {snip.etaLabel}</span>
                    ) : null}
                  </div>
                ) : null}
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
          );
        })}
      </ul>
    </section>
  );
}
