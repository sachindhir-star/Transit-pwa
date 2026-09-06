#!/usr/bin/env python3
"""Rebuild public/data/ctb-index.json from Citybus open data (run when routes change)."""
import json, urllib.request, concurrent.futures, time, os
BASE = "https://rt.data.gov.hk/v2/transport/citybus"
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "data", "ctb-index.json")

def get(path):
    url = f"{BASE}/{path}"
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.load(r)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(0.5 * (attempt + 1))

def main():
    routes = get("route/ctb")["data"]
    tasks = [(r["route"], d) for r in routes for d in ("outbound", "inbound")]
    route_stops = {}
    stop_ids = set()

    def fetch_rs(item):
        route, direction = item
        try:
            data = get(f"route-stop/ctb/{route}/{direction}")["data"] or []
            stops = [x["stop"] for x in sorted(data, key=lambda z: z["seq"])]
            return route, direction, stops
        except Exception:
            return route, direction, []

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        for route, direction, stops in ex.map(fetch_rs, tasks):
            route_stops[f"{route}|{direction[0].upper()}"] = stops
            stop_ids.update(stops)

    def fetch_stop(sid):
        try:
            d = get(f"stop/{sid}")["data"] or {}
            if not d.get("lat"):
                return None
            return {
                "id": sid,
                "name": d.get("name_en") or sid,
                "nameZh": d.get("name_tc"),
                "lat": float(d["lat"]),
                "lng": float(d["long"]),
            }
        except Exception:
            return None

    stops = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
        for s in ex.map(fetch_stop, list(stop_ids)):
            if s:
                stops[s["id"]] = s

    meta = {
        r["route"]: {
            "origEn": r.get("orig_en"),
            "destEn": r.get("dest_en"),
            "origTc": r.get("orig_tc"),
            "destTc": r.get("dest_tc"),
        }
        for r in routes
    }
    out = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "routes": meta,
        "routeStops": route_stops,
        "stops": stops,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("Wrote", OUT, "stops", len(stops), "routeDirs", len(route_stops))

if __name__ == "__main__":
    main()
