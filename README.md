# HK Transit PWA (Discovery Bay)

Phone-first Hong Kong transit planner for a Discovery Bay household.
Vite + React + TypeScript + PWA.

**Repo:** https://github.com/sachindhir-star/Transit-pwa

## Features (MVR)

1. **From → To planner** — curated corridors with bus/ferry/MTR legs, boarding & alight stops, time + adult Octopus fare estimates, walk legs. From/To support **address & building search** (HK ALS + Nominatim).
2. **Favourites** (localStorage, pre-seeded): DB↔Central, Central→Wan Chai, Sunny Bay→Mong Kok / Sham Shui Po, DB→Tung Chung / Airport, and more.
3. **Locked-route map** — operator stop sequences snapped to **roads via OSRM** on **key-free OSM tiles**. When KMB/Citybus ETA is available, buses are shown as **ETA-inferred** positions along that polyline. **Never fake GPS.**
4. **DB buses tab** — Discovery Bay map focused on C4 / C9 and other internal routes. DBTSL has no public GPS; UI is honest schedule/shape only (no fake dots).

Coverage: Discovery Bay, HK Island, Kowloon, Lantau (Sunny Bay / Tung Chung).
Operators: KMB, Citybus, DB buses, Lantau routes; **DB↔Central ferry is first-class**.

## Sample trip

1. Open the app (defaults to **DB Plaza → Central Pier 3**).
3. Select **Walk + DB Ferry → Central Pier 3**.
4. Map shows ferry corridor; banner explains schedule mode.
5. Try Sunny Bay to Mong Kok for MTR/bus options.

## Run locally

```
bun install && bun run dev
# or npm install && npm run dev
```

Open http://localhost:5173

Dev proxies:
- /api/kmb → https://data.etabus.gov.hk/v1/transport/kmb
- /api/ctb → https://rt.data.gov.hk/v2/transport/citybus
- /api/osrm → https://router.project-osrm.org

```
bun run build && bun run preview
```

## iPhone Home Screen

1. Open HTTPS URL in Safari.
2. Share → add to Home Screen.
3. Name: HK Transit.

## APIs

- KMB/LWB: data.etabus.gov.hk/v1/transport/kmb
- Citybus: rt.data.gov.hk/v2/transport/citybus
- Route geometry: operator stop order + OSRM road snap (no official shapes in ETA/GTFS)
- DB bus / DB ferry: schedule fallbacks (no open ETA/GPS) — see Data tab
- MTR: connecting hints only

## Deploy

Static dist/ with base ./. Publish via GitHub Pages (gh-pages branch or Actions).

## Limitations

Corridor-curated MVP. Fare estimates. Confirm DB ferry/bus timetables on the day.
Map dots are ETA-inferred when feeds work.

## Temporary preview on this box
Local preview: http://127.0.0.1:5178/
Tunnel: https://cage-friday-parliament-parties.trycloudflare.com
Tunnel script: /workspace/start-transit-tunnel.sh
