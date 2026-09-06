import type { Place } from "../types";

/** Curated places for DB household corridors. Coordinates are public map centres. */
export const PLACES: Place[] = [
  // Discovery Bay
  {
    id: "db-plaza",
    name: "DB Plaza",
    nameZh: "愉景灣廣場",
    area: "DB",
    lat: 22.2972,
    lng: 114.0165,
    aliases: ["discovery bay plaza", "db plaza", "plaza"],
    kind: "plaza",
  },
  {
    id: "db-ferry",
    name: "DB Ferry Pier",
    nameZh: "愉景灣碼頭",
    area: "DB",
    lat: 22.2963,
    lng: 114.0178,
    aliases: ["discovery bay pier", "db pier", "db ferry"],
    kind: "pier",
  },
  {
    id: "db-north",
    name: "DB North (Siena)",
    nameZh: "愉景灣北",
    area: "DB",
    lat: 22.3025,
    lng: 114.0105,
    aliases: ["siena", "db north"],
    kind: "area",
  },
  {
    id: "db-park",
    name: "Discovery Bay (general)",
    nameZh: "愉景灣",
    area: "DB",
    lat: 22.2975,
    lng: 114.014,
    aliases: ["discovery bay", "db", "愉景灣"],
    kind: "area",
  },

  // Central / Admiralty / Wan Chai
  {
    id: "central-pier3",
    name: "Central Pier 3",
    nameZh: "中環3號碼頭",
    area: "Island",
    lat: 22.2871,
    lng: 114.1606,
    aliases: ["central pier", "pier 3", "中環碼頭"],
    kind: "pier",
  },
  {
    id: "exchange-square",
    name: "Exchange Square",
    nameZh: "交易廣場",
    area: "Island",
    lat: 22.2839,
    lng: 114.1585,
    aliases: ["exchange square", "central bus", "中環交易廣場"],
    kind: "bus",
  },
  {
    id: "central-mtr",
    name: "Central MTR",
    nameZh: "中環站",
    area: "Island",
    lat: 22.2819,
    lng: 114.1582,
    aliases: ["central", "中環"],
    kind: "mtr",
  },
  {
    id: "admiralty",
    name: "Admiralty",
    nameZh: "金鐘",
    area: "Island",
    lat: 22.2783,
    lng: 114.1647,
    aliases: ["admiralty", "金鐘"],
    kind: "mtr",
  },
  {
    id: "wan-chai",
    name: "Wan Chai",
    nameZh: "灣仔",
    area: "Island",
    lat: 22.2776,
    lng: 114.1731,
    aliases: ["wan chai", "wanchai", "灣仔"],
    kind: "mtr",
  },
  {
    id: "exhibition",
    name: "Exhibition Centre / Wan Chai North",
    nameZh: "會展",
    area: "Island",
    lat: 22.2815,
    lng: 114.1738,
    aliases: ["exhibition", "hkcec", "會展"],
    kind: "mtr",
  },
  {
    id: "causeway-bay",
    name: "Causeway Bay",
    nameZh: "銅鑼灣",
    area: "Island",
    lat: 22.2800,
    lng: 114.1850,
    aliases: ["causeway bay", "銅鑼灣"],
    kind: "mtr",
  },

  // Kowloon
  {
    id: "mong-kok",
    name: "Mong Kok",
    nameZh: "旺角",
    area: "Kowloon",
    lat: 22.3193,
    lng: 114.1694,
    aliases: ["mong kok", "mongkok", "旺角"],
    kind: "mtr",
  },
  {
    id: "sham-shui-po",
    name: "Sham Shui Po",
    nameZh: "深水埗",
    area: "Kowloon",
    lat: 22.3307,
    lng: 114.1622,
    aliases: ["sham shui po", "ssp", "深水埗"],
    kind: "mtr",
  },
  {
    id: "tsim-sha-tsui",
    name: "Tsim Sha Tsui",
    nameZh: "尖沙咀",
    area: "Kowloon",
    lat: 22.2976,
    lng: 114.1722,
    aliases: ["tst", "tsim sha tsui", "尖沙咀"],
    kind: "mtr",
  },
  {
    id: "jordan",
    name: "Jordan",
    nameZh: "佐敦",
    area: "Kowloon",
    lat: 22.3050,
    lng: 114.1716,
    aliases: ["jordan", "佐敦"],
    kind: "mtr",
  },
  {
    id: "lai-chi-kok",
    name: "Lai Chi Kok",
    nameZh: "荔枝角",
    area: "Kowloon",
    lat: 22.3372,
    lng: 114.1489,
    aliases: ["lai chi kok", "荔枝角"],
    kind: "mtr",
  },

  // Lantau
  {
    id: "sunny-bay",
    name: "Sunny Bay",
    nameZh: "欣澳",
    area: "Lantau",
    lat: 22.3314,
    lng: 114.0289,
    aliases: ["sunny bay", "欣澳", "yam oi"],
    kind: "mtr",
  },
  {
    id: "tung-chung",
    name: "Tung Chung",
    nameZh: "東涌",
    area: "Lantau",
    lat: 22.2893,
    lng: 113.9411,
    aliases: ["tung chung", "東涌"],
    kind: "mtr",
  },
  {
    id: "airport",
    name: "Hong Kong Airport",
    nameZh: "機場",
    area: "Lantau",
    lat: 22.3080,
    lng: 113.9185,
    aliases: ["airport", "hkg", "機場"],
    kind: "bus",
  },
  {
    id: "disneyland",
    name: "Disneyland",
    nameZh: "迪士尼",
    area: "Lantau",
    lat: 22.3133,
    lng: 114.0413,
    aliases: ["disney", "disneyland", "迪士尼"],
    kind: "mtr",
  },
];

export function getPlace(id: string): Place | undefined {
  return PLACES.find((p) => p.id === id);
}

export function searchPlaces(q: string): Place[] {
  const s = q.trim().toLowerCase();
  if (!s) return PLACES;
  return PLACES.filter((p) => {
    const hay = [p.name, p.nameZh ?? "", ...(p.aliases ?? [])].join(" ").toLowerCase();
    return hay.includes(s);
  });
}
