import { useEffect, useState } from "react";
import { enrichTripShapes } from "./api/enrichShape";
import { DbBusMap } from "./components/DbBusMap";
import { FavouritesBar } from "./components/FavouritesBar";
import { LegDeparture } from "./components/LegDeparture";
import { PlacePicker } from "./components/PlacePicker";
import { RouteMap } from "./components/RouteMap";
import { TripOptions } from "./components/TripOptions";
import { DATA_SOURCES } from "./data/sources";
import { getPlace } from "./data/places";
import { useFavourites } from "./hooks/useFavourites";
import { useLiveEtasForLegs } from "./hooks/useLiveEta";
import { planTripsAsync } from "./lib/hkPlanner";
import type { Place, TripOption } from "./types";
import "./App.css";

type Tab = "plan" | "db" | "about";

export default function App() {
  const { favourites, resetDefaults } = useFavourites();
  const [tab, setTab] = useState<Tab>("plan");
  const [from, setFrom] = useState<Place | null>(() => getPlace("db-plaza") ?? null);
  const [to, setTo] = useState<Place | null>(() => getPlace("central-pier3") ?? null);
  const [options, setOptions] = useState<TripOption[]>([]);
  const [planStatus, setPlanStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [selected, setSelected] = useState<TripOption | null>(null);
  const [legIndex, setLegIndex] = useState(0);
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    if (!from || !to) {
      setOptions([]);
      setPlanStatus("idle");
      return;
    }
    let cancelled = false;
    setPlanStatus("loading");
    setOptions([]);
    setSelected(null);
    planTripsAsync(from, to)
      .then((opts) => {
        if (cancelled) return;
        setOptions(opts);
        setPlanStatus("ready");
      })
      .catch((e) => {
        console.warn("plan failed", e);
        if (cancelled) return;
        setOptions([]);
        setPlanStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const legEtaStates = useLiveEtasForLegs(selected?.legs ?? []);
  const activeEta = legEtaStates[legIndex] ?? {
    etas: [],
    status: "idle" as const,
    error: null,
  };

  const lockTrip = async (opt: TripOption) => {
    setSelected(opt);
    const firstBus = opt.legs.findIndex(
      (l) => l.mode === "CTB" || l.mode === "KMB" || l.mode === "DB",
    );
    setLegIndex(firstBus >= 0 ? firstBus : 0);
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
            exists, and they are labeled ETA-inferred. Citybus/KMB trip options use stop proximity +
            route-stop matching from open data (HK-wide). DBTSL routes use eta.dbtsl.com stop ETAs +
            OSRM roads (no vehicle GPS).
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

          {planStatus === "loading" && (
            <p className="note">Matching Citybus/KMB stops &amp; routes across Hong Kong…</p>
          )}
          {planStatus === "error" && (
            <p className="note">Could not load open-data bus index. Try again shortly.</p>
          )}

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
              {enriching && <p className="note">Loading road / footpath geometry…</p>}

              <div className="locked-departs">
                {selected.legs.map((leg, i) => {
                  const st = legEtaStates[i] ?? {
                    etas: [],
                    status: "idle" as const,
                    error: null,
                  };
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`leg-depart-wrap${i === legIndex ? " selected" : ""}`}
                      onClick={() => setLegIndex(i)}
                    >
                      <LegDeparture
                        leg={leg}
                        etas={st.etas}
                        status={st.status}
                        error={st.error}
                        active={i === legIndex}
                      />
                    </button>
                  );
                })}
              </div>

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
              <RouteMap
                trip={selected}
                etas={activeEta.etas}
                etaStatus={activeEta.status}
                etaError={activeEta.error}
                activeLegIndex={legIndex}
              />
            </section>
          )}
        </main>
      )}

      <footer className="foot">
        HK-wide Citybus/KMB open-data · DB ferry first-class · Sample: DB → Pacific Place · MK → Wan
        Chai
      </footer>
    </div>
  );
}
