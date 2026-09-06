import type { Place } from "../types";

export interface GeocodeHit {
  id: string;
  name: string;
  nameZh?: string;
  areaLabel: string;
  lat: number;
  lng: number;
  source: "als" | "nominatim" | "photon" | "overpass" | "curated";
  /** OSM class/key when known (shop, amenity, tourism, building, …) */
  poiClass?: string;
}

const NOMINATIM_UA =
  "HKTransitPWA/1.0 (https://github.com/sachindhir-star/Transit-pwa)";

/** HK bounding box for Nominatim viewbox: left,top,right,bottom */
const HK_VIEWBOX = "113.80,22.56,114.45,22.15";
/** Photon / Overpass bbox: minLon,minLat,maxLon,maxLat */
const HK_BBOX = { minLon: 113.8, minLat: 22.15, maxLon: 114.45, maxLat: 22.56 };
const HK_CENTER = { lat: 22.3, lng: 114.17 };

const POI_CLASSES = new Set([
  "shop",
  "amenity",
  "tourism",
  "leisure",
  "office",
  "craft",
  "healthcare",
  "historic",
]);

const POI_HINT =
  /\b(mall|plaza|centre|center|shop|store|cafe|café|restaurant|hotel|market|ikea|museum|park|pier|harbour|harbor|temple|church|hospital|school|university|library|cinema|theatre|theater|gallery|stadium|gym|bar|pub|bakery|supermarket|department|outlet)\b|商場|廣場|餐廳|咖啡|酒店|酒店|公園|碼頭|廟|醫院|大學|超市|百貨|宜家|利園/i;

interface AlsSuggestion {
  Address?: {
    PremisesAddress?: {
      EngPremisesAddress?: {
        BuildingName?: string;
        EngEstate?: { EstateName?: string };
        EngStreet?: { StreetName?: string; BuildingNoFrom?: string };
        EngDistrict?: { DcDistrict?: string };
        Region?: string;
      };
      ChiPremisesAddress?: {
        BuildingName?: string;
        ChiEstate?: { EstateName?: string };
        ChiStreet?: { StreetName?: string };
        ChiDistrict?: { DcDistrict?: string };
      };
      GeospatialInformation?: {
        Latitude?: string;
        Longitude?: string;
      };
    };
  };
  ValidationInformation?: { Score?: number };
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function areaFromDistrict(district?: string): Place["area"] {
  const d = (district ?? "").toUpperCase();
  if (d.includes("ISLANDS") || d.includes("離島")) return "Lantau";
  if (
    d.includes("YAU TSIM") ||
    d.includes("SHAM SHUI") ||
    d.includes("KOWLOON") ||
    d.includes("KWUN TONG") ||
    d.includes("WONG TAI") ||
    d.includes("九龍") ||
    d.includes("深水") ||
    d.includes("旺角") ||
    d.includes("油尖")
  )
    return "Kowloon";
  if (
    d.includes("CENTRAL") ||
    d.includes("WAN CHAI") ||
    d.includes("EASTERN") ||
    d.includes("SOUTHERN") ||
    d.includes("中西") ||
    d.includes("灣仔") ||
    d.includes("東區") ||
    d.includes("南區")
  )
    return "Island";
  return "Other";
}

export function hitToPlace(hit: GeocodeHit): Place {
  return {
    id: hit.id,
    name: hit.name,
    nameZh: hit.nameZh,
    area: areaFromDistrict(hit.areaLabel),
    lat: hit.lat,
    lng: hit.lng,
    kind: hit.poiClass && POI_CLASSES.has(hit.poiClass) ? "plaza" : "area",
    aliases: [hit.areaLabel],
  };
}

function inHk(lat: number, lng: number): boolean {
  return (
    lat >= HK_BBOX.minLat &&
    lat <= HK_BBOX.maxLat &&
    lng >= HK_BBOX.minLon &&
    lng <= HK_BBOX.maxLon
  );
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return norm(s)
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/** Street-number address vs brand / POI style query. */
export function looksLikePoiQuery(q: string): boolean {
  const t = q.trim();
  if (POI_HINT.test(t)) return true;
  if (/^\d+[A-Za-z]?\s+\S+/.test(t)) return false;
  if (/(street|road|avenue|lane|drive|道|街|里|巷|邨|村)\s*$/i.test(t)) return false;
  // Multi-token brand+district ("IKEA Causeway Bay") or single brand-like word
  const toks = tokens(t);
  if (toks.length === 0) return false;
  if (toks.length === 1 && /[a-z\u4e00-\u9fff]/i.test(toks[0]) && !/^\d+$/.test(toks[0]))
    return true;
  return toks.length >= 2 && !/^\d+$/.test(toks[0]);
}

function isPoiHit(h: GeocodeHit): boolean {
  if (h.source === "overpass") return true;
  if (h.poiClass && POI_CLASSES.has(h.poiClass)) return true;
  if (h.poiClass === "building" || h.poiClass === "landuse") return true;
  return false;
}

function nameMatchScore(name: string, query: string): number {
  const n = norm(name);
  const q = norm(query);
  if (!n || !q) return 0;
  if (n === q) return 120;
  if (n.startsWith(q) || q.startsWith(n)) return 90;
  if (n.includes(q)) return 70;
  const qt = tokens(query);
  const nt = new Set(tokens(name));
  if (!qt.length) return 0;
  let hit = 0;
  for (const t of qt) {
    if (nt.has(t) || n.includes(t)) hit += 1;
  }
  // Prefer when the distinctive first token (brand) matches
  const brandBonus = qt[0] && (nt.has(qt[0]) || n.includes(qt[0])) ? 35 : 0;
  return Math.round((hit / qt.length) * 50) + brandBonus;
}

/** Soft district centres for ranking (not invented places — boost only). */
const DISTRICT_HINTS: Array<{ re: RegExp; lat: number; lng: number }> = [
  { re: /causeway\s*bay|銅鑼灣|銅鑼湾/i, lat: 22.2803, lng: 114.1847 },
  { re: /admiralty|金鐘/i, lat: 22.2783, lng: 114.1645 },
  { re: /\bcentral\b|中環|中环/i, lat: 22.2819, lng: 114.1582 },
  { re: /tsim\s*sha\s*tsui|尖沙咀/i, lat: 22.2976, lng: 114.1722 },
  { re: /mong\s*kok|旺角/i, lat: 22.3193, lng: 114.1694 },
  { re: /kwun\s*tong|觀塘|观塘/i, lat: 22.312, lng: 114.2265 },
  { re: /tsuen\s*wan|荃灣|荃湾/i, lat: 22.3707, lng: 114.1145 },
  { re: /sha\s*tin|沙田/i, lat: 22.3827, lng: 114.188 },
  { re: /tung\s*chung|東涌|东涌/i, lat: 22.2893, lng: 113.9415 },
];

function districtBiasMetres(query: string, lat: number, lng: number): number {
  for (const d of DISTRICT_HINTS) {
    if (!d.re.test(query)) continue;
    const dlat = (lat - d.lat) * 111_320;
    const dlng = (lng - d.lng) * 111_320 * Math.cos((lat * Math.PI) / 180);
    return Math.hypot(dlat, dlng);
  }
  return Number.POSITIVE_INFINITY;
}

function rankScore(h: GeocodeHit, query: string, poiMode: boolean): number {
  let s = nameMatchScore(h.name, query);
  if (h.nameZh) s = Math.max(s, nameMatchScore(h.nameZh, query) * 0.95);

  if (poiMode) {
    if (isPoiHit(h)) s += 55;
    if (h.source === "als") s -= 25; // ALS buildings drown brand searches
    if (h.poiClass === "highway" || h.poiClass === "railway") s -= 35;
    const dist = districtBiasMetres(query, h.lat, h.lng);
    if (Number.isFinite(dist)) {
      if (dist < 800) s += 40;
      else if (dist < 2500) s += 15;
      else s -= 20;
    }
  } else {
    if (h.source === "als") s += 20;
    if (isPoiHit(h)) s += 10;
  }
  return s;
}

async function searchAls(q: string, limit = 6): Promise<GeocodeHit[]> {
  const url = `https://www.als.gov.hk/lookup?q=${encodeURIComponent(q)}&n=${limit}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`ALS HTTP ${res.status}`);
  const data = (await res.json()) as { SuggestedAddress?: AlsSuggestion[] };
  const out: GeocodeHit[] = [];
  for (const sug of data.SuggestedAddress ?? []) {
    const prem = sug.Address?.PremisesAddress;
    const eng = prem?.EngPremisesAddress;
    const chi = prem?.ChiPremisesAddress;
    const geo = prem?.GeospatialInformation;
    const lat = Number(geo?.Latitude);
    const lng = Number(geo?.Longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const building = eng?.BuildingName?.trim();
    const estate = eng?.EngEstate?.EstateName?.trim();
    const street = eng?.EngStreet?.StreetName?.trim();
    const no = eng?.EngStreet?.BuildingNoFrom?.trim();
    const district = eng?.EngDistrict?.DcDistrict?.trim() ?? "";
    const name =
      building ||
      estate ||
      [no, street].filter(Boolean).join(" ") ||
      q;
    const nameZh =
      chi?.BuildingName?.trim() ||
      chi?.ChiEstate?.EstateName?.trim() ||
      undefined;
    const areaBits = [district, street ? `${no ?? ""} ${street}`.trim() : ""]
      .filter(Boolean)
      .join(" · ");
    out.push({
      id: `als-${slug(name)}-${lat.toFixed(5)}-${lng.toFixed(5)}`,
      name,
      nameZh,
      areaLabel: areaBits || "Hong Kong",
      lat,
      lng,
      source: "als",
    });
  }
  return out;
}

async function searchNominatim(q: string, limit = 5): Promise<GeocodeHit[]> {
  const params = new URLSearchParams({
    format: "json",
    q,
    limit: String(limit),
    countrycodes: "hk",
    viewbox: HK_VIEWBOX,
    bounded: "1",
    addressdetails: "1",
  });
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": NOMINATIM_UA,
      },
    },
  );
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const rows = (await res.json()) as Array<{
    place_id: number;
    lat: string;
    lon: string;
    display_name: string;
    name?: string;
    class?: string;
    type?: string;
    address?: Record<string, string>;
  }>;
  return rows
    .map((r) => {
      const lat = Number(r.lat);
      const lng = Number(r.lon);
      const addr = r.address ?? {};
      const short =
        r.name ||
        addr.shop ||
        addr.amenity ||
        addr.tourism ||
        addr.building ||
        addr.suburb ||
        r.display_name.split(",")[0];
      const areaLabel = [
        addr.suburb || addr.neighbourhood,
        addr.city_district || addr.district || addr.city,
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        id: `osm-${r.place_id}`,
        name: short,
        areaLabel:
          areaLabel || r.display_name.split(",").slice(1, 3).join(",").trim(),
        lat,
        lng,
        source: "nominatim" as const,
        poiClass: r.class,
      };
    })
    .filter((h) => inHk(h.lat, h.lng));
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    country?: string;
    city?: string;
    district?: string;
    locality?: string;
    street?: string;
    type?: string;
  };
}

async function searchPhoton(q: string, limit = 8): Promise<GeocodeHit[]> {
  const params = new URLSearchParams({
    q,
    limit: String(limit),
    lat: String(HK_CENTER.lat),
    lon: String(HK_CENTER.lng),
    bbox: `${HK_BBOX.minLon},${HK_BBOX.minLat},${HK_BBOX.maxLon},${HK_BBOX.maxLat}`,
    lang: "en",
  });
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);
  const data = (await res.json()) as { features?: PhotonFeature[] };
  const out: GeocodeHit[] = [];
  for (const f of data.features ?? []) {
    const coords = f.geometry?.coordinates;
    const p = f.properties ?? {};
    if (!coords || coords.length < 2) continue;
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inHk(lat, lng))
      continue;
    const name = (p.name || p.street || q).trim();
    if (!name) continue;
    const areaLabel = [p.locality || p.district, p.city || "Hong Kong"]
      .filter(Boolean)
      .join(" · ");
    const osmId = p.osm_id ?? `${lat.toFixed(5)}-${lng.toFixed(5)}`;
    out.push({
      id: `photon-${p.osm_type ?? "n"}-${osmId}`,
      name,
      areaLabel,
      lat,
      lng,
      source: "photon",
      poiClass: p.osm_key,
    });
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Primary searchable token for Overpass (brand), drop weak district words. */
function overpassNeedle(q: string): string {
  const drop = new Set([
    "hong",
    "kong",
    "hk",
    "the",
    "and",
    "bay",
    "causeway",
    "central",
    "kowloon",
    "island",
    "district",
    "香港",
  ]);
  const toks = tokens(q).filter((t) => !drop.has(t) && t.length >= 2);
  // Prefer longest Latin/CJK token (brand names)
  toks.sort((a, b) => b.length - a.length);
  return toks[0] || tokens(q)[0] || q.trim();
}

async function searchOverpass(q: string, limit = 8): Promise<GeocodeHit[]> {
  const needle = overpassNeedle(q);
  if (needle.length < 2) return [];
  const re = escapeRegex(needle);
  const { minLat, minLon, maxLat, maxLon } = HK_BBOX;
  const bbox = `${minLat},${minLon},${maxLat},${maxLon}`;
  const query = `[out:json][timeout:18];
(
  nwr["name"~"${re}",i](${bbox});
  nwr["name:en"~"${re}",i](${bbox});
  nwr["brand"~"${re}",i](${bbox});
  nwr["brand:en"~"${re}",i](${bbox});
);
out center ${Math.max(limit, 12)};`;

  // Overpass rejects some Accept values with 406; send form body only.
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: new URLSearchParams({ data: query }).toString(),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = (await res.json()) as {
    elements?: Array<{
      type: string;
      id: number;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }>;
  };

  const out: GeocodeHit[] = [];
  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null || !inHk(lat, lng)) continue;

    const poiClass =
      (tags.shop && "shop") ||
      (tags.amenity && "amenity") ||
      (tags.tourism && "tourism") ||
      (tags.leisure && "leisure") ||
      (tags.office && "office") ||
      (tags.craft && "craft") ||
      (tags.building && "building") ||
      (tags.landuse && "landuse") ||
      undefined;

    // Skip pure transport nodes unless nothing else — filtered later by rank
    const name =
      tags["name:en"]?.trim() ||
      tags.name?.trim() ||
      tags["brand:en"]?.trim() ||
      tags.brand?.trim();
    if (!name) continue;

    // Keep amenity/shop/tourism/building; also name-matched commercial
    const useful =
      poiClass === "shop" ||
      poiClass === "amenity" ||
      poiClass === "tourism" ||
      poiClass === "leisure" ||
      poiClass === "office" ||
      poiClass === "building" ||
      tags.landuse === "retail" ||
      tags.landuse === "commercial";
    if (!useful) continue;

    const areaLabel = [
      tags["addr:district"] || tags["addr:suburb"],
      tags["addr:city"] || "Hong Kong",
    ]
      .filter(Boolean)
      .join(" · ");

    out.push({
      id: `overpass-${el.type}-${el.id}`,
      name,
      nameZh: tags["name:zh"]?.trim() || tags["name:zh-Hant"]?.trim(),
      areaLabel,
      lat,
      lng,
      source: "overpass",
      poiClass: poiClass ?? "amenity",
    });
  }
  return out.slice(0, limit);
}

function nearDup(a: GeocodeHit, b: GeocodeHit, metres = 45): boolean {
  const dlat = (a.lat - b.lat) * 111_320;
  const dlng = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dlat, dlng) < metres;
}

function pushUnique(merged: GeocodeHit[], hits: GeocodeHit[]) {
  for (const h of hits) {
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lng)) continue;
    const existing = merged.find((m) => m.id === h.id || nearDup(m, h));
    if (!existing) {
      merged.push(h);
      continue;
    }
    // Prefer POI / OSM name over nearby ALS building when names differ strongly
    const preferNew =
      isPoiHit(h) &&
      !isPoiHit(existing) &&
      nameMatchScore(h.name, h.name) >= 0;
    if (preferNew && nameMatchScore(h.name, existing.name) < 70) {
      const idx = merged.indexOf(existing);
      merged[idx] = h;
    }
  }
}

function hasStrongPoiMatch(hits: GeocodeHit[], query: string): boolean {
  return hits.some((h) => {
    const score = nameMatchScore(h.name, query);
    if (score < 70) return false;
    if (isPoiHit(h)) return true;
    // Exact/near-exact OSM name (e.g. mall labelled on a gate/stop) is enough
    // to skip Overpass — still a real OSM feature with usable lat/lng.
    if (h.source !== "als" && score >= 90) return true;
    return false;
  });
}

/**
 * Remote place search for HK:
 * ALS for addresses/buildings; Photon (+ Nominatim if available) for shops/POIs;
 * Overpass name search when the query looks like a POI and OSM geocoders are weak.
 */
export async function searchRemotePlaces(q: string): Promise<GeocodeHit[]> {
  const query = q.trim();
  if (query.length < 2) return [];

  const poiMode = looksLikePoiQuery(query);
  const merged: GeocodeHit[] = [];

  const settled = await Promise.allSettled([
    searchAls(query, poiMode ? 4 : 6),
    searchPhoton(query, 8),
    searchNominatim(query, 5),
  ]);

  for (const r of settled) {
    if (r.status === "fulfilled") pushUnique(merged, r.value);
    else console.warn("geocode source failed", r.reason);
  }

  if (poiMode && !hasStrongPoiMatch(merged, query)) {
    try {
      pushUnique(merged, await searchOverpass(query, 8));
    } catch (e) {
      console.warn("Overpass geocode failed", e);
    }
  }

  merged.sort(
    (a, b) => rankScore(b, query, poiMode) - rankScore(a, query, poiMode),
  );
  return merged.slice(0, 10);
}
