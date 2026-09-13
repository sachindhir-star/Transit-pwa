import { useState } from "react";
import { DbBusMap } from "./components/DbBusMap";
import { DbFerryMap } from "./components/DbFerryMap";
import { DATA_SOURCES } from "./data/sources";
import "./App.css";

type Tab = "buses" | "ferries" | "about";

export default function App() {
  const [tab, setTab] = useState<Tab>("buses");

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="eyebrow">Discovery Bay · Hong Kong</p>
          <h1>DB Transportation App</h1>
        </div>
        <nav className="tabs">
          <button
            type="button"
            className={tab === "buses" ? "active" : ""}
            onClick={() => setTab("buses")}
          >
            Buses
          </button>
          <button
            type="button"
            className={tab === "ferries" ? "active" : ""}
            onClick={() => setTab("ferries")}
          >
            Ferries
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
            exists, and they are labeled ETA-inferred. DB buses use eta.dbtsl.com stop ETAs + OSRM
            roads (no vehicle GPS). Ferries are timetable-only with honest sea corridors — no
            vessel GPS.
          </p>
        </main>
      ) : tab === "ferries" ? (
        <main className="main">
          <DbFerryMap />
        </main>
      ) : (
        <main className="main">
          <DbBusMap />
        </main>
      )}

      <footer className="foot">
        Discovery Bay buses &amp; ferries · Timetable-first · No invented GPS
      </footer>
    </div>
  );
}
