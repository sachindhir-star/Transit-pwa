import { useMemo } from "react";
import type { DbtslStopEta } from "../api/dbtslEta";
import {
  buildBusColumns,
  C4_BOARD,
  C9_BOARD,
  type BusColumnModel,
  type LandmarkEta,
  type RouteBoardDef,
} from "../lib/busColumnBoard";
import { useDbtslLive } from "../hooks/useDbtslLive";

function LandmarkRow({ lm }: { lm: LandmarkEta }) {
  return (
    <div
      className={`bcb-stop ${lm.passed ? "passed" : ""} ${lm.etaLabel ? "has-eta" : ""}`}
      title={lm.feedName ?? lm.label}
    >
      <span className="bcb-stop-dot" aria-hidden />
      <div className="bcb-stop-text">
        <span className="bcb-stop-name">{lm.label}</span>
        <span className="bcb-stop-eta">
          {lm.etaLabel ?? (lm.passed ? "Passed" : "—")}
        </span>
      </div>
    </div>
  );
}

function BusColumn({ col }: { col: BusColumnModel }) {
  const pct = Math.round(col.progress * 1000) / 10;
  return (
    <article className="bcb-column" aria-label={`Trip ${col.plate}`}>
      <header className="bcb-col-head">
        <span className="bcb-plate">{col.plate}</span>
        <span className="bcb-inferred">ETA-inferred</span>
      </header>
      <div className="bcb-track-wrap">
        <div className="bcb-track" aria-hidden>
          <div className="bcb-track-line" />
          <div
            className="bcb-bus-dot"
            style={{ top: `${pct}%` }}
            title={`${col.plate} · ETA-inferred (not GPS)`}
          >
            <span className="bcb-bus-icon" />
          </div>
        </div>
        <div className="bcb-stops">
          {col.landmarks.map((lm) => (
            <LandmarkRow key={lm.id} lm={lm} />
          ))}
        </div>
      </div>
    </article>
  );
}

function RoutePanel({
  def,
  stops,
  loading,
}: {
  def: RouteBoardDef;
  stops: DbtslStopEta[] | null;
  loading: boolean;
}) {
  const columns = useMemo(() => buildBusColumns(stops, def), [stops, def]);

  return (
    <section className="bcb-panel" aria-label={`${def.title} bus board`}>
      <header className="bcb-panel-head">
        <h3>{def.title}</h3>
        <span className="bcb-panel-meta">
          {columns.length > 0
            ? `${columns.length} active`
            : loading
              ? "Loading…"
              : "Idle"}
        </span>
      </header>
      {columns.length === 0 ? (
        <p className="bcb-empty">{def.emptyLabel}</p>
      ) : (
        <div className="bcb-columns">
          {columns.map((col) => (
            <BusColumn key={col.tripCode} col={col} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Glanceable C4 | C9 board: one vertical column per active trip,
 * fixed landmarks Coastline/Crestmont → Main Plaza → North Plaza.
 */
export function BusColumnBoard() {
  const c4 = useDbtslLive("C4");
  const c9 = useDbtslLive("C9");

  const refreshing = c4.refreshing || c9.refreshing;
  const ago = c4.agoLabel || c9.agoLabel;

  const refreshBoth = () => {
    c4.refresh();
    c9.refresh();
  };

  return (
    <section className="bcb" aria-label="C4 and C9 bus column board">
      <div className="bcb-head">
        <div>
          <h3 className="bcb-title">C4 · C9 board</h3>
          <p className="note">
            One column per active bus · fixed landmarks · clock ETA + mins · blue
            dot is ETA-inferred (not Live GPS)
          </p>
        </div>
        <div className="db-live-controls">
          {ago ? (
            <span className="db-updated" aria-live="polite">
              {ago}
            </span>
          ) : null}
          <button
            type="button"
            className="db-refresh"
            onClick={refreshBoth}
            disabled={refreshing}
            aria-label="Refresh C4 and C9 board"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="bcb-grid">
        <RoutePanel
          def={C4_BOARD}
          stops={c4.stops}
          loading={!c4.stops && !c4.error}
        />
        <RoutePanel
          def={C9_BOARD}
          stops={c9.stops}
          loading={!c9.stops && !c9.error}
        />
      </div>
    </section>
  );
}
