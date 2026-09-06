import { useEffect, useState } from "react";
import { filterUsableEtas, formatEtaLabel, nextDepartureHeadline } from "../lib/formatEta";
import {
  ferryTimetableCaption,
  formatFerryClock,
  nextFerryDepartures,
  nextFerryHeadline,
} from "../lib/dbFerryTimetable";
import { isDbFerryLeg } from "../data/dbFerrySeaPath";
import { stopLocationParts } from "../lib/stopLabel";
import type { LiveEta, TripLeg } from "../types";

type EtaStatus = "idle" | "loading" | "live" | "unavailable";

interface Props {
  leg: TripLeg;
  etas: LiveEta[];
  status: EtaStatus;
  error?: string | null;
  /** Highlight when this is the map’s active leg */
  active?: boolean;
}

export function LegDeparture({ leg, etas, status, error, active }: Props) {
  const board = stopLocationParts(leg.fromStop.name);
  const alight = stopLocationParts(leg.toStop.name);
  const rows = filterUsableEtas(etas).slice(0, 4);
  const headline = nextDepartureHeadline(leg, etas);
  const isBus = leg.mode === "CTB" || leg.mode === "KMB" || leg.mode === "DB";
  const wantsLive = Boolean(leg.eta) || leg.trackingMode === "live-eta";
  const isDbFerry = isDbFerryLeg(leg);

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!isDbFerry) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [isDbFerry]);

  const ferryNow = new Date(nowTick);
  const ferryDeps = isDbFerry ? nextFerryDepartures(leg.fromStop, 4, ferryNow) : [];
  const ferryHeadline = isDbFerry ? nextFerryHeadline(leg, ferryNow) : null;

  return (
    <article className={`leg-depart${active ? " active" : ""}`}>
      <header className="leg-depart-head">
        <span className={`mode mode-${leg.mode}`}>{leg.mode}</span>
        {leg.route ? <strong className="leg-depart-route">{leg.route}</strong> : null}
        {leg.routeName ? <span className="leg-depart-dest">{leg.routeName}</span> : null}
      </header>

      <div className="leg-depart-loc">
        <div className="leg-depart-board">
          <span className="leg-depart-label">Board</span>
          <p className="leg-depart-stop">{board.title}</p>
          {board.street ? <p className="leg-depart-street">{board.street}</p> : null}
          {leg.fromStop.nameZh ? <p className="leg-depart-zh">{leg.fromStop.nameZh}</p> : null}
        </div>
        <div className="leg-depart-alight">
          <span className="leg-depart-label">Alight</span>
          <p className="leg-depart-stop-sm">{alight.title}</p>
          {alight.street ? <p className="leg-depart-street">{alight.street}</p> : null}
        </div>
      </div>

      {isDbFerry ? (
        <div className="leg-depart-eta" role="status">
          {ferryHeadline ? (
            <>
              <p className="leg-depart-headline">{ferryHeadline}</p>
              {ferryDeps.length > 1 ? (
                <ul className="leg-depart-etas">
                  {ferryDeps.map((d, i) => (
                    <li key={`${d.time}-${i}`}>
                      <strong>
                        {formatFerryClock(d)} ({d.minutesUntil} mins)
                      </strong>
                      <span> · ferry timetable</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="note">{ferryTimetableCaption()}</p>
            </>
          ) : (
            <p className="leg-depart-headline warn">
              No published ferry departures right now — confirm DB / TD timetable.
            </p>
          )}
        </div>
      ) : isBus && wantsLive ? (
        <div className="leg-depart-eta" role="status">
          {status === "loading" && !rows.length ? (
            <p className="leg-depart-headline muted">Fetching live departure…</p>
          ) : headline ? (
            <>
              <p className="leg-depart-headline">{headline}</p>
              {rows.length > 1 ? (
                <ul className="leg-depart-etas">
                  {rows.map((e, i) => (
                    <li key={i}>
                      <strong>
                        {formatEtaLabel({ etaIso: e.etaIso, minutes: e.minutes }) ?? "—"}
                      </strong>
                      {e.dest ? <span> → {e.dest}</span> : null}
                      {e.remark ? <span className="rmk"> · {e.remark}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="leg-depart-headline warn">
              No live departure times right now
              {error ? ` — ${error}` : " — feed empty or outside service hours"}. Board and alight
              stops stay above.
            </p>
          )}
        </div>
      ) : leg.trackingMode === "schedule" ? (
        <p className="note">Schedule / curated corridor — confirm operator timetable for clock times.</p>
      ) : leg.mode === "WALK" || leg.trackingMode === "walk" ? (
        <p className="note">{leg.notes ?? "Walking leg"}</p>
      ) : leg.mode === "FERRY" ? (
        <p className="note">{leg.notes ?? "Ferry — check operator timetable for departures."}</p>
      ) : leg.notes ? (
        <p className="note">{leg.notes}</p>
      ) : null}
    </article>
  );
}
