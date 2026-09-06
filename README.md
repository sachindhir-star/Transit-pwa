# HK Transit PWA (Discovery Bay)

Phone-first Hong Kong transit planner for a Discovery Bay household.
Vite + React + TypeScript + PWA.

**Repo:** https://github.com/sachindhir-star/Transit-pwa

## Features (MVR)

1. **From → To planner (HK-wide)** — Citybus/KMB options from open-data **stop proximity + route-stop matching** across Hong Kong Island, Kowloon, New Territories & Lantau. DB↔Central **ferry is first-class**; ferry+connecting bus for Island destinations (e.g. Pacific Place). Board/alight stops, time + adult Octopus estimates, walk legs. From/To support **address & building search** (HK ALS + Nominatim).
2. **Favourites** (localStorage, pre-seeded): DB↔Central, DB→Pacific Place, Mong Kok→Wan Chai, Tsuen Wan→Central, Sunny Bay→Mong Kok, and more.
3. **Locked-route map** — operator stop sequences snapped to **roads via OSRM** on **key-free OSM tiles**. When KMB/Citybus ETA is available, buses are shown as **ETA-inferred** positions along that polyline. **Never fake GPS.**
4. **DB buses tab** — Discovery Bay map (C4/C9/6, DB01R/DB02R…). Live **stop ETAs** from `eta.dbtsl.com`. **No vehicle GPS** — bus icons are ETA-inferred on OSRM roads with heading. **C4 board** / **C9 board** below the map when that chip is selected (never both side-by-side): one vertical column per active bus listing **all stops** in `get_bus_stops` route order, clock ETA + mins (Passed / — when appropriate), and a blue ETA-inferred progress dot. Tall columns scroll inside the board for phone use. Optional **your GPS** suggests nearest stop, walk time, next ETA, and likely direction.

Coverage: **entire Hong Kong** (Island, Kowloon, NT, Lantau/DB) via open-data bus matching + curated DB ferry.
Operators: KMB, Citybus (ex-NWFB), DBTSL, Lantau links; **DB↔Central ferry is first-class**; MTR as connecting hints.

## Sample trips

1. **DB Plaza → Pacific Place** — ferry primary + Citybus connecting legs from Central/Admiralty hubs (open-data board/alight).
2. **Mong Kok → Wan Chai** — cross-harbour Citybus (e.g. 104) as first-class.
3. **Tsuen Wan → Central** — Citybus 930 corridor + MTR hint.
4. Lock a bus leg to see OSRM road shape + live ETA when the feed has data.

Rebuild Citybus index (occasional): `python3 scripts/build-ctb-index.py`

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

DBTSL ETA is called directly (CORS `*`): `https://eta.dbtsl.com/api/v0/get_bus_stops`

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
- DB bus: eta.dbtsl.com stop-ETA JSON (no vehicle GPS) — see Data tab
- DB ferry: schedule fallbacks (no open vessel GPS)
- MTR: connecting hints only

## Deploy

Static dist/ with base ./. Publish via GitHub Pages (gh-pages branch or Actions).

## Limitations

Hub + nearby-stop matching MVP (not a full multimodal graph). Fares are estimates.
Confirm DB ferry/bus timetables on the day. Map dots are ETA-inferred when feeds work.
First plan after load may wait on the KMB stop/route-stop download (~few MB).

## Temporary preview on this box
Local preview: http://127.0.0.1:5178/
Tunnel: https://cage-friday-parliament-parties.trycloudflare.com
Tunnel script: /workspace/start-transit-tunnel.sh
