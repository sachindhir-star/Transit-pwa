#!/usr/bin/env python3
"""Rebuild src/data/dbtslTimetable.json from DBTSL schedule CSVs."""
from __future__ import annotations

import argparse
import csv
import html
import json
import re
import sys
import urllib.request
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

DAY_KEYS = {
    "1": "monThu",
    "2": "sat",
    "3": "sunPh",
    "5": "fri",
}

LINE_NAME_TO_KEY = {
    "C4": "C4",
    "C9": "C9",
    "1": "1",
    "2": "2",
    "3": "3",
    "5": "5",
    "6": "6",
    "15": "15",
    "18": "18",
    "01R": "DB01R",
    "01A": "DB01A",
    "01P": "DB01P",
    "02R": "DB02R",
    "02A": "DB02A",
    "03R": "DB03R",
    "03P": "DB03P",
    "N08R": "DB08R",
}

NOTE = (
    "Official DBTSL Discovery Bay app schedule CSVs (bus_line_schedule → bus_line_schedule_time). "
    "Published clock times are keyed by timetable From / terminus (bus_line_route), not every intermediate stop. "
    "fromStops lists each published From when the CSV has one; for circular village routes 1 & 6 an approx village "
    "table is derived (+3 min per official remark) because the CSV has no separate village schedule."
)

SOURCE = "https://dbapp-api-prd.hkricloud.com/transport_version/getData"

PREFERRED_ORDER = [
    "C4", "C9", "1", "2", "3", "5", "6", "15", "18",
    "DB01R", "DB01A", "DB01P", "DB02R", "DB02A", "DB03R", "DB03P", "DB08R",
]


def clean(s: str) -> str:
    return html.unescape((s or "").replace("&#44;", ",")).strip()


def slug_label(stop: str) -> tuple[str, str]:
    s = clean(stop)
    rules = [
        (r"DB Plaza Bus Terminus|^DB Plaza$", "plaza", "Plaza"),
        (r"DB North Plaza", "north-plaza", "North Plaza"),
        (r"Coastline", "coastline", "Coastline"),
        (r"Crestmont", "crestmont", "Crestmont"),
        (r"Caperidge", "caperidge", "Caperidge"),
        (r"Headland.*Drive|Headland Village - Headland", "headland", "Headland"),
        (r"Seabee", "seabee", "Seabee"),
        (r"Marine View", "marine-view", "Marine View"),
        (r"Midvale", "midvale", "Midvale"),
        (r"Woodgreen", "woodgreen", "Woodgreen"),
        (r"Parkvale", "parkvale", "Parkvale"),
        (r"Serene Court", "serene-court", "Serene Court"),
        (r"La Serene", "la-serene", "La Serene"),
        (r"Chianti", "chianti", "Chianti"),
        (r"IL PICCO|Il Picco", "il-picco", "IL PICCO"),
        (r"Tung Chung", "tung-chung", "Tung Chung"),
        (r"Airport", "airport", "Airport"),
        (r"HZMB|Hong Kong Port", "hk-port", "HK Port"),
        (r"Sunny Bay", "sunny-bay", "Sunny Bay"),
        (r"Central Pier", "central-pier", "Central Pier"),
    ]
    for pat, sid, label in rules:
        if re.search(pat, s, re.I):
            return sid, label
    base = re.sub(r"\s*\([^)]*\)\s*", " ", s).strip()
    slug = re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-") or "stop"
    words = base.split()
    short = " ".join(words[:2]) if words else slug
    return slug, short


def parse_minutes_field(minutes: str) -> list[str]:
    out = []
    for tok in minutes.split():
        tok = tok.strip()
        if not tok:
            continue
        # ^ = combined / refer-to-other-route (e.g. 02R midday → 02RA)
        if "^" in tok:
            continue
        m = re.match(r"^(\d{1,2})\*?$", tok)
        if not m:
            m = re.match(r"^(\d{1,2})", tok)
        if not m:
            continue
        out.append(f"{int(m.group(1)):02d}")
    return out


def expand_times(rows: list[dict]) -> list[str]:
    items = []
    for row in rows:
        if row.get("status") and row["status"] != "1":
            continue
        try:
            hour = int(row["hour"])
            order = int(row.get("order") or 0)
        except ValueError:
            continue
        for mm in parse_minutes_field(row["minutes"]):
            items.append((order, hour, int(mm), f"{hour:02d}:{mm}"))
    items.sort(key=lambda x: (x[1], x[2], x[0]))
    seen = set()
    out = []
    for _, _, _, t in items:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


def day_key_for_schedule(name: str, available_time: str) -> str | None:
    at = (available_time or "").strip()
    if at in DAY_KEYS:
        return DAY_KEYS[at]
    n = (name or "").strip().lower()
    if "consecutive" in n:
        return None
    if "fri" in n:
        return "fri"
    if "sat" in n:
        return "sat"
    if "sun" in n or "ph" in n:
        return "sunPh"
    if "mon" in n or "week" in n:
        return "monThu"
    return None


def is_primary_terminus(stop: str) -> bool:
    s = clean(stop)
    return bool(
        re.search(
            r"DB Plaza Bus Terminus|DB North Plaza|Tung Chung Station|Coastline Villa$",
            s,
            re.I,
        )
    )


def load_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def build(csv_dir: Path, version: str) -> dict:
    lines = load_csv(csv_dir / "bus_line.csv")
    routes = load_csv(csv_dir / "bus_line_route.csv")
    schedules = load_csv(csv_dir / "bus_line_schedule.csv")
    times = load_csv(csv_dir / "bus_line_schedule_time.csv")
    special = load_csv(csv_dir / "special_day.csv")

    times_by_sched: dict[str, list[dict]] = defaultdict(list)
    for t in times:
        times_by_sched[t["bus_schedule_id"]].append(t)

    schedules_by_route: dict[str, list[dict]] = defaultdict(list)
    for s in schedules:
        schedules_by_route[s["bus_route_id"]].append(s)

    routes_by_line: dict[str, list[dict]] = defaultdict(list)
    for r in routes:
        routes_by_line[r["bus_line_id"]].append(r)

    holidays = []
    for row in special:
        if row.get("status") != "1" or row.get("holiday_bus") != "1":
            continue
        start = date.fromisoformat(row["start_date"])
        end = date.fromisoformat(row["end_date"])
        name = clean(row["name"])
        cur = start
        while cur <= end:
            if date(2025, 1, 1) <= cur <= date(2027, 12, 31):
                holidays.append({"start": cur.isoformat(), "end": cur.isoformat(), "name": name})
            cur += timedelta(days=1)
    holidays.sort(key=lambda h: (h["start"], h["name"]))

    out_routes: dict[str, dict] = {}

    for line in lines:
        csv_name = (line.get("name") or "").strip()
        key = LINE_NAME_TO_KEY.get(csv_name)
        if not key or line.get("status") != "1":
            continue

        usable = []
        for r in routes_by_line[line["bus_line_id"]]:
            if key == "DB08R" and r.get("return") == "1":
                continue
            ss = [s for s in schedules_by_route[r["bus_route_id"]] if s.get("status") == "1"]
            if ss:
                usable.append(r)
        if not usable:
            continue

        from_stops_raw = []
        for r in usable:
            stop = clean(r["name"])
            end_point = clean(r["end_point"])
            sid, label = slug_label(stop)
            day_labels: dict[str, str] = {}
            departures: dict[str, list[str]] = {}
            for s in schedules_by_route[r["bus_route_id"]]:
                if s.get("status") != "1":
                    continue
                dk = day_key_for_schedule(s["name"], s["available_time"])
                if not dk:
                    continue
                clock = expand_times(times_by_sched[s["bus_schedule_id"]])
                if not clock:
                    continue
                if dk not in departures:
                    departures[dk] = clock
                    day_labels[dk] = clean(s["name"])
            if not departures:
                continue
            from_stops_raw.append(
                {
                    "id": sid,
                    "label": label,
                    "stop": stop,
                    "endPoint": end_point,
                    "published": True,
                    "dayLabels": day_labels,
                    "departures": departures,
                    "_return": r.get("return"),
                    "_time_point": r.get("time_point"),
                }
            )

        by_id: dict[str, dict] = {}
        for fs in from_stops_raw:
            sid = fs["id"]
            if sid not in by_id or len(fs["departures"]) > len(by_id[sid]["departures"]):
                by_id[sid] = fs
        from_stops = list(by_id.values())

        if key in ("1", "6"):
            plaza = next((f for f in from_stops if f["id"] == "plaza"), None)
            if plaza and key == "1" and not any(f["id"] == "headland" for f in from_stops):
                from_stops.append(
                    {
                        "id": "headland",
                        "label": "Headland",
                        "stop": "Headland Village - Headland Drive",
                        "endPoint": "DB Plaza Bus Terminus",
                        "published": False,
                        "approxOffsetMinutes": 3,
                        "approxFromId": "plaza",
                        "note": "Official DBTSL remark: village departure ≈ 3 min after Plaza terminus (CSV has no separate Headland schedule).",
                    }
                )
            if plaza and key == "6" and not any(f["id"] == "seabee" for f in from_stops):
                from_stops.append(
                    {
                        "id": "seabee",
                        "label": "Seabee",
                        "stop": "Headland Village - Seabee Lane",
                        "endPoint": "DB Plaza Bus Terminus",
                        "published": False,
                        "approxOffsetMinutes": 3,
                        "approxFromId": "plaza",
                        "note": "Official DBTSL remark: village departure ≈ 3 min after Plaza terminus (CSV has no separate Seabee schedule).",
                    }
                )

        published = [f for f in from_stops if f.get("published")]

        def primary_score(f: dict) -> tuple:
            return (
                1 if is_primary_terminus(f["stop"]) else 0,
                1 if f.get("_return") == "0" else 0,
                1 if f.get("_time_point") == "1" and "North Plaza" in f["stop"] else 0,
            )

        primary = max(published, key=primary_score) if published else None
        if primary is None:
            continue

        order_rank = {
            "plaza": 0,
            "north-plaza": 0,
            "coastline": 1,
            "crestmont": 1,
            "marine-view": 1,
            "woodgreen": 1,
            "serene-court": 1,
            "headland": 2,
            "seabee": 2,
            "midvale": 2,
            "parkvale": 2,
            "la-serene": 2,
            "chianti": 1,
            "il-picco": 1,
            "tung-chung": 1,
            "airport": 1,
            "hk-port": 2,
            "sunny-bay": 1,
            "central-pier": 1,
        }

        def sort_key(f):
            if f["id"] == primary["id"]:
                return (-1, 0, f["id"])
            return (0, order_rank.get(f["id"], 50), f["id"])

        clean_from = []
        for f in sorted(from_stops, key=sort_key):
            item = {
                "id": f["id"],
                "label": f["label"],
                "stop": f["stop"],
                "endPoint": f["endPoint"],
                "published": bool(f.get("published", True)),
            }
            if f.get("dayLabels"):
                item["dayLabels"] = f["dayLabels"]
            if f.get("departures"):
                item["departures"] = f["departures"]
            if f.get("approxOffsetMinutes") is not None:
                item["approxOffsetMinutes"] = f["approxOffsetMinutes"]
                item["approxFromId"] = f["approxFromId"]
                item["note"] = f["note"]
            clean_from.append(item)

        out_routes[key] = {
            "stop": primary["stop"],
            "endPoint": primary["endPoint"],
            "dayLabels": primary.get("dayLabels") or {},
            "departures": primary.get("departures") or {},
            "fromStops": clean_from,
            "scheduleKeyedBy": "terminus-from",
        }

    ordered = {k: out_routes[k] for k in PREFERRED_ORDER if k in out_routes}
    for k, v in out_routes.items():
        if k not in ordered:
            ordered[k] = v

    return {
        "version": version,
        "source": SOURCE,
        "mediaBase": f"https://dbapp-media-prd.hkricloud.com/schedules_and_fares/version_{version}/",
        "note": NOTE,
        "holidays": holidays,
        "routes": ordered,
    }


def compare(old: dict, new: dict) -> bool:
    print("versions", old.get("version"), "->", new.get("version"))
    print("holiday counts", len(old["holidays"]), len(new["holidays"]))
    ok = True
    for k in old["routes"]:
        if k not in new["routes"]:
            print("MISSING route", k)
            ok = False
            continue
        o, n = old["routes"][k], new["routes"][k]
        if o["stop"] != n["stop"] or o["endPoint"] != n["endPoint"]:
            print(k, "stop/end mismatch", repr(o["stop"]), repr(n["stop"]), "|", repr(o["endPoint"]), repr(n["endPoint"]))
            ok = False
        of = {f["id"]: f for f in o.get("fromStops") or []}
        nf = {f["id"]: f for f in n.get("fromStops") or []}
        if set(of) != set(nf):
            print(k, "fromStop ids", set(of), "vs", set(nf))
            ok = False
        for fid in of:
            if fid not in nf:
                continue
            odep = of[fid].get("departures") or {}
            ndep = nf[fid].get("departures") or {}
            for day in sorted(set(odep) | set(ndep)):
                if odep.get(day) != ndep.get(day):
                    a, b = odep.get(day) or [], ndep.get(day) or []
                    print(k, fid, day, "dep mismatch", len(a), len(b))
                    for i, (x, y) in enumerate(zip(a, b)):
                        if x != y:
                            print("  first diff at", i, x, y)
                            break
                    print("  only_old", [t for t in a if t not in b][:8])
                    print("  only_new", [t for t in b if t not in a][:8])
                    ok = False
            for field in ("published", "approxOffsetMinutes", "approxFromId", "stop", "endPoint", "label"):
                if of[fid].get(field) != nf[fid].get(field):
                    print(k, fid, field, of[fid].get(field), "vs", nf[fid].get(field))
                    ok = False
    for k in new["routes"]:
        if k not in old["routes"]:
            print("EXTRA route", k)
            ok = False
    print("COMPARE_OK" if ok else "COMPARE_DIFFS")
    return ok


def fetch_latest(dest: Path) -> str:
    req = urllib.request.Request(
        SOURCE,
        headers={"Accept": "application/json", "User-Agent": "DiscoveryBay/1.0"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        meta = json.load(resp)
    ver = meta["version"]
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "transport_version.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    for link in meta.get("links") or []:
        url = link["link"]
        name = url.rstrip("/").split("/")[-1]
        urllib.request.urlretrieve(url, dest / name)
    return ver


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv-dir", type=Path, help="Directory with DBTSL CSVs")
    ap.add_argument("--version", help="Transport version string")
    ap.add_argument("--out", type=Path, default=Path("src/data/dbtslTimetable.json"))
    ap.add_argument("--validate-against", type=Path, help="Existing JSON to compare")
    ap.add_argument("--fetch", action="store_true", help="Fetch latest CSVs into --csv-dir")
    args = ap.parse_args()

    csv_dir = args.csv_dir or Path("/tmp/dbtsl_sched")
    if args.fetch:
        ver = fetch_latest(csv_dir)
    else:
        ver = args.version
        if not ver:
            meta_path = csv_dir / "transport_version.json"
            if meta_path.exists():
                ver = json.loads(meta_path.read_text())["version"]
            else:
                print("Need --version or transport_version.json", file=sys.stderr)
                return 2

    built = build(csv_dir, ver)
    if args.validate_against:
        old = json.loads(args.validate_against.read_text())
        ok = compare(old, built)
        return 0 if ok else 1

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(built, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {args.out} version={ver} routes={list(built['routes'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
