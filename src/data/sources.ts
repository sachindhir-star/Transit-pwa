/** Documented data sources & honest fallback notes for SD. */
export const DATA_SOURCES = {
  kmb: {
    name: "KMB / LWB ETA API",
    url: "https://data.etabus.gov.hk/v1/transport/kmb",
    coverage: "KMB & Long Win routes — stops, route-stop sequences, live ETA",
    liveGps: false,
    note: "No public vehicle GPS or route polyline. Planner loads full stop + route-stop lists for HK-wide proximity matching. Map uses stop order + OSRM roads; dots are ETA-inferred along that shape.",
  },
  citybus: {
    name: "Citybus ETA API (data.gov.hk)",
    url: "https://rt.data.gov.hk/v2/transport/citybus",
    coverage: "Citybus (incl. ex-NWFB) routes — stops, route-stop, live ETA; Island / cross-harbour / NT express",
    liveGps: false,
    note: "No bulk stop list endpoint — app ships a generated stop/route-stop index (public/data/ctb-index.json) built from the open API. ETA + OSRM shapes at lock time; never fake GPS.",
  },
  dbBus: {
    name: "Discovery Bay buses (DBTSL)",
    url: "https://eta.dbtsl.com/",
    coverage: "Internal DB routes (1/2/3/5/6/15/18/C4/C9) and external DB01R/DB02R/DB03R/DB08R via official ETA WebView",
    liveGps: false,
    note: "Semi-public stop-ETA JSON at eta.dbtsl.com/api/v0 (CORS open; used inside Discovery Bay app). Fields: stop lat/lng, predicted time[], trip_code (incl. plate), people_cnt. No vehicle-position / GPS endpoint — map uses ordered stops + OSRM road geometry; bus icons are ETA-inferred along the road toward the next stop (with heading), never Live GPS. Poll ~20s + manual Refresh. DB buses UX is timetable-first: published clock times from official Discovery Bay app schedule CSVs (dbapp-api-prd.hkricloud.com transport_version/getData → bus_line_schedule_time) are always shown (hours/minutes grid + next departures, labeled timetable). Live feed sits on top when eta.dbtsl.com has active trips; if live is empty the timetable stays — never only “no active trip”. Header pill: live next ETA minutes, else next timetable clock labeled timetable — never a fake ~headway badge.",
  },
  dbFerry: {
    name: "DB ↔ Central Ferry",
    url: "https://www.nwff.com.hk/ / DB ferry timetable",
    coverage: "Discovery Bay ↔ Central Pier 3",
    liveGps: false,
    note: "Treated as first-class corridor. Schedule-based ETAs only; no live vessel GPS in open data.",
  },
  mtr: {
    name: "MTR (connecting hint)",
    url: "https://www.mtr.com.hk/",
    coverage: "Island / Tsuen Wan / Tung Chung / Disneyland Resort lines as transfer hints",
    liveGps: false,
    note: "MTR shown as connecting hint with typical ride times — not full journey planner.",
  },
  als: {
    name: "HK Address Lookup (ALS)",
    url: "https://www.als.gov.hk/",
    coverage: "Hong Kong building / estate / street address geocoding for From–To search",
    liveGps: false,
    note: "Free government address API (JSON). Nominatim/OSM used as secondary fallback.",
  },
  nominatim: {
    name: "OpenStreetMap Nominatim",
    url: "https://nominatim.openstreetmap.org/",
    coverage: "Secondary place search when ALS is sparse",
    liveGps: false,
    note: "Respect usage policy; app sends an identifying User-Agent.",
  },
  osrm: {
    name: "OSRM (OpenStreetMap routing)",
    url: "https://project-osrm.org/",
    coverage: "Driving geometry between consecutive operator stops when no official bus polyline is published",
    liveGps: false,
    note: "Citybus/KMB/DBTSL lack official polylines. Ordered stop coords + OSRM road snap for locked CTB/KMB legs and DB bus map. ETA markers follow that polyline and stay labeled ETA-inferred.",
  },
} as const;
