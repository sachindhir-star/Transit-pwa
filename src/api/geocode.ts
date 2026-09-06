import type { Place } from "../types";

export interface GeocodeHit {
  id: string;
  name: string;
  nameZh?: string;
  areaLabel: string;
  lat: number;
  lng: number;
  source: "als" | "nominatim" | "curated";
}

const NOMINATIM_UA =
  "HKTransitPWA/1.0 (https://github.com/sachindhir-star/Transit-pwa)";

/** HK bounding box for Nominatim viewbox: left,top,right,bottom */
const HK_VIEWBOX = "113.80,22.56,114.45,22.15";

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
    kind: "area",
    aliases: [hit.areaLabel],
  };
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
    address?: Record<string, string>;
  }>;
  return rows.map((r) => {
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    const addr = r.address ?? {};
    const short =
      r.name ||
      addr.building ||
      addr.amenity ||
      addr.tourism ||
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
      areaLabel: areaLabel || r.display_name.split(",").slice(1, 3).join(",").trim(),
      lat,
      lng,
      source: "nominatim" as const,
    };
  });
}

function nearDup(a: GeocodeHit, b: GeocodeHit, metres = 45): boolean {
  const dlat = (a.lat - b.lat) * 111_320;
  const dlng = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dlat, dlng) < metres;
}

/** Remote address / building search for HK (ALS primary, Nominatim fallback). */
export async function searchRemotePlaces(q: string): Promise<GeocodeHit[]> {
  const query = q.trim();
  if (query.length < 2) return [];

  const merged: GeocodeHit[] = [];
  const pushUnique = (hits: GeocodeHit[]) => {
    for (const h of hits) {
      if (merged.some((m) => nearDup(m, h) || m.id === h.id)) continue;
      merged.push(h);
    }
  };

  try {
    pushUnique(await searchAls(query, 6));
  } catch (e) {
    console.warn("ALS geocode failed", e);
  }

  if (merged.length < 4) {
    try {
      pushUnique(await searchNominatim(query, 5));
    } catch (e) {
      console.warn("Nominatim geocode failed", e);
    }
  }

  return merged.slice(0, 10);
}
