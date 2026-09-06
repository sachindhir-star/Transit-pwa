/** Documented data sources & honest fallback notes for SD. */
export const DATA_SOURCES = {
  kmb: {
    name: "KMB / LWB ETA API",
    url: "https://data.etabus.gov.hk/v1/transport/kmb",
    coverage: "KMB & Long Win routes — stops, route-stop sequences, live ETA",
    liveGps: false,
    note: "No public vehicle GPS. Map dots are ETA-inferred along the stop shape when ETAs exist.",
  },
  citybus: {
    name: "Citybus ETA API (data.gov.hk)",
    url: "https://rt.data.gov.hk/v2/transport/citybus",
    coverage: "Citybus (incl. ex-NWFB) routes — stops, route-stop, live ETA",
    liveGps: false,
    note: "No public vehicle GPS. Same ETA-inferred animation policy as KMB.",
  },
  dbBus: {
    name: "Discovery Bay buses (DBTSL)",
    url: "https://www.hkdb.com.hk/ / operator notices",
    coverage: "Internal DB routes (C4/C9 etc.) and external DB0x links",
    liveGps: false,
    note: "No open real-time ETA API. App uses published schedule windows + labeled schedule fallback.",
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
} as const;
