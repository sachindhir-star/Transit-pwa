import { useMemo, useState } from "react";
import { enrichTripShapes } from "./api/enrichShape";
import { DbBusMap } from "./components/DbBusMap";
import { FavouritesBar } from "./components/FavouritesBar";
import { PlacePicker } from "./components/PlacePicker";
import { RouteMap } from "./components/RouteMap";
import { TripOptions } from "./components/TripOptions";
import { planTrips } from "./data/corridors";
import { DATA_SOURCES } from "./data/sources";
import { getPlace } from "./data/places";
import { useFavourites } from "./hooks/useFavourites";
import { useLiveEta } from "./hooks/useLiveEta";
import type { Place, TripOption } from "./types";
import "./App.css";

type Tab = "plan" | "db" | "about";

export default function App() {
  const { favourites, resetDefaults } = useFavourites();
  const [tab, setTab] = useState<Tab>("plan");
  const [from, setFrom] = useState<Place | null>(() => getPlace("db-plaza") ?? null);
  const [to, setTo] = useState<Place | null>(() => getPlace("central-pier3") ?? null);
  const [selected, setSelected] = useState<TripOption | null>(null);
  const [legIndex, setLegIndex] = useState(0);
  const [enriching, setEnriching] = useState(false);

  const options = useMemo(() => {
    if (!from || !to) return [];
    return planTrips(from, to);
  }, [from, to]);

  const activeLeg = selected?.legs[legIndex] ?? null;
  const { etas, status, error } = useLiveEta(activeLeg);

  const lockTrip = async (opt: TripOption) => {
    setSelected(opt);
    setLegIndex(0);
    setEnriching(true);
    try {
      const enriched = await enrichTripShapes(opt);
      setSelected(enriched);
    } catch (e) {
      console.warn("enrich failed", e);
    } finally {
      setEnriching(false);
    }
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
    setSelected(null);
  };

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="eyebrow">Discovery Bay · Hong Kong</p>
          <h1>HK Transit</h1>
        </div>
        <nav className="tabs">
          <button
            type="button"
            className={tab === "plan" ? "active" : ""}
            onClick={() => setTab("plan")}
          >
            Plan
          </button>
          <button
            type="button"
            className={tab === "db" ? "active" : ""}
            onClick={() => setTab("db")}
          >
            DB buses
          </button>
          <button
            type="button"
            className={tab === "about" ? "active" : ""}
            onClick={() => setTab("about")}
          >
            Data
          </button>
        </nav>
      </header>

      {tab === "about" ? (
        <main className="about">
          <h2>Data sources</h2>
          <ul className="sources">
            {Object.values(DATA_SOURCES).map((s) => (
              <li key={s.name}>
                <strong>{s.name}</strong>
                <p>{s.coverage}</p>
                <p className="note">{s.note}</p>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.url}
                </a>
              </li>
            ))}
          </ul>
          <p className="note">
            Adult Octopus fares are estimates. Never invent GPS — live dots only when an ETA feed
            exists, and they are labeled ETA-inferred. DBTSL internal buses have no public GPS.
          </p>
        </main>
      ) : tab === "db" ? (
        <main className="main">
          <DbBusMap />
        </main>
      ) : (
        <main className="main">
          <FavouritesBar
            favourites={favourites}
            onReset={resetDefaults}
            onPick={(f, t) => {
              setFrom(f);
              setTo(t);
              setSelected(null);
            }}
          />

          <section className="planner">
            <PlacePicker
              label="From"
              value={from}
              onChange={(p) => {
                setFrom(p);
                setSelected(null);
              }}
              excludeId={to?.id}
            />
            <button type="button" className="swap" onClick={swap} aria-label="Swap">
              ↕
            </button>
            <PlacePicker
              label="To"
              value={to}
              onChange={(p) => {
                setTo(p);
                setSelected(null);
              }}
              excludeId={from?.id}
            />
          </section>

          <TripOptions options={options} selectedId={selected?.id ?? null} onSelect={lockTrip} />

          {selected && (
            <section className="locked">
              <div className="locked-head">
                <h2>Locked route</h2>
                <button type="button" className="linkish" onClick={() => setSelected(null)}>
                  Clear
                </button>
              </div>
              <p className="locked-sum">{selected.summary}</p>
              {enriching && <p className="note">Loading road-following route shape…</p>}
              <div className="leg-tabs">
                {selected.legs.map((leg, i) => (
                  <button
                    key={i}
                    type="button"
                    className={i === legIndex ? "active" : ""}
                    onClick={() => setLegIndex(i)}
                  >
                    {leg.mode}
                    {leg.route ? ` ${leg.route}` : ""}
                  </button>
                ))}
              </div>
              <div className="leg-detail">
                <p>
                  <strong>Board:</strong> {activeLeg?.fromStop.name}
                </p>
                <p>
                  <strong>Alight:</strong> {activeLeg?.toStop.name}
                </p>
                {activeLeg?.notes && <p className="note">{activeLeg.notes}</p>}
              </div>
              <RouteMap
                trip={selected}
                etas={etas}
                etaStatus={status}
                etaError={error}
                activeLegIndex={legIndex}
              />
            </section>
          )}
        </main>
      )}

      <footer className="foot">
        Sample: DB Plaza → Central Pier 3 · DB buses tab for C4 / C9 · Add to Home Screen
      </footer>
    </div>
  );
}
