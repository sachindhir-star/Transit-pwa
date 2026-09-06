import { useMemo } from "react";
import {
  buildBusColumns,
  C4_BOARD,
  C9_BOARD,
  type BusColumnModel,
  type ColumnStopEta,
  type RouteBoardDef,
} from "../lib/busColumnBoard";
import { useDbtslLive } from "../hooks/useDbtslLive";

function StopRow({ stop }: { stop: ColumnStopEta }) {
  return (
    <div
      className={`bcb-stop ${stop.passed ? "passed" : ""} ${stop.etaLabel ? "has-eta" : ""}`}
      title={stop.label}
    >
      <span className="bcb-stop-dot" aria-hidden />
      <div className="bcb-stop-text">
        <span className="bcb-stop-name">{stop.label}</span>
        <span className="bcb-stop-eta">
          {stop.etaLabel ?? (stop.passed ? "Passed" : "—")}
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
          {col.stops.map((stop) => (
            <StopRow key={stop.stopIndex} stop={stop} />
          ))}
        </div>
      </div>
    </article>
  );
}

function boardDefFor(routeNumber: string): RouteBoardDef | null {
  if (routeNumber === "C4") return C4_BOARD;
  if (routeNumber === "C9") return C9_BOARD;
  return null;
}

/**
 * Glanceable per-route board for C4 or C9 (never both at once).
 * One vertical column per active trip; all stops in get_bus_stops order.
 */
export function BusColumnBoard({ routeNumber }: { routeNumber: string }) {
  const def = boardDefFor(routeNumber);
  const live = useDbtslLive(def ? routeNumber : null);

  const columns = useMemo(
    () => (def ? buildBusColumns(live.stops, def) : []),
    [live.stops, def],
  );

  if (!def) return null;

  const loading = !live.stops && !live.error;
  const title = `${def.route} board`;
  const stopCount = columns[0]?.stops.length ?? live.stops?.length ?? 0;

  return (
    <section className="bcb" aria-label={title}>
      <div className="bcb-head">
        <div>
          <h3 className="bcb-title">{title}</h3>
          <p className="note">
            One column per active bus · all stops from get_bus_stops (
            {stopCount || "…"} in route order) · clock ETA + mins · blue dot is
            ETA-inferred (not Live GPS)
          </p>
        </div>
        <div className="db-live-controls">
          {live.agoLabel ? (
            <span className="db-updated" aria-live="polite">
              {live.agoLabel}
            </span>
          ) : null}
          <span className="bcb-panel-meta" aria-live="polite">
            {columns.length > 0
              ? `${columns.length} active`
              : loading
                ? "Loading…"
                : "Idle"}
          </span>
          <button
            type="button"
            className="db-refresh"
            onClick={live.refresh}
            disabled={live.refreshing}
            aria-label={`Refresh ${title}`}
          >
            {live.refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

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
