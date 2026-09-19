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
import {
  detectTimetableLiveGap,
  formatLivePlateCount,
} from "../lib/liveBusUx";
import {
  getTodaysSchedule,
  nextScheduledDepartures,
} from "../lib/dbtslTimetable";
import { DB_BUS_ROUTES } from "../data/dbBuses";

function StopRow({ stop }: { stop: ColumnStopEta }) {
  return (
    <div
      className={`bcb-stop ${stop.prominence} ${stop.passed ? "passed" : ""} ${stop.etaLabel ? "has-eta" : ""}`}
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
 * Main landmarks (Coastline/Crestmont, Plaza, North Plaza) render larger.
 */
export function BusColumnBoard({ routeNumber }: { routeNumber: string }) {
  const def = boardDefFor(routeNumber);
  const live = useDbtslLive(def ? routeNumber : null);

  const columns = useMemo(
    () => (def ? buildBusColumns(live.stops, def) : []),
    [live.stops, def],
  );

  const headwayMin = useMemo(() => {
    const r = DB_BUS_ROUTES.find((x) => x.number === routeNumber);
    return r?.headwayMin ?? 12;
  }, [routeNumber]);

  const liveCountLine = useMemo(
    () => formatLivePlateCount(columns.map((c) => c.plate)),
    [columns],
  );

  const timetableGap = useMemo(() => {
    if (!def) return null;
    const schedule = getTodaysSchedule(routeNumber);
    const nextDepartures = nextScheduledDepartures(routeNumber, 8);
    return detectTimetableLiveGap({
      liveTripCount: columns.length,
      schedule,
      nextDepartures,
      headwayMin,
    });
  }, [def, routeNumber, columns.length, headwayMin]);

  if (!def) return null;

  const loading = !live.stops && !live.error;
  const title = `${def.route} board`;
  const stopCount = columns[0]?.stops.length ?? live.stops?.length ?? 0;
  const mainCount =
    columns[0]?.stops.filter((s) => s.prominence === "main").length ?? 0;

  return (
    <section className="bcb" aria-label={title}>
      <div className="bcb-head">
        <div>
          <h3 className="bcb-title">{title}</h3>
          <p
            className={`bcb-live-count ${columns.length === 0 ? "empty" : columns.length === 1 ? "one" : "multi"}`}
            role="status"
            aria-live="polite"
          >
            <strong>{loading && columns.length === 0 ? "Live: …" : liveCountLine}</strong>
          </p>
          <p className="note">
            One column per active bus · all stops from get_bus_stops (
            {stopCount || "…"} in route order
            {mainCount ? `, ${mainCount} main landmarks larger` : ""}
            ) · clock ETA + mins · blue dot is ETA-inferred (not Live GPS)
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

      {timetableGap ? (
        <div className="db-tt-live-gap bcb-gap" role="note">
          {timetableGap.note}
        </div>
      ) : null}

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
