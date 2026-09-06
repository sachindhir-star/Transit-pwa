import type { LiveEta } from "../types";
import { ctbUrl, fetchJson, kmbUrl } from "./client";

interface KmbEtaRow {
  eta: string | null;
  dest_en?: string;
  dest_tc?: string;
  rmk_en?: string;
  data_timestamp?: string;
}

interface CtbEtaRow {
  eta: string | null;
  dest_en?: string;
  dest_tc?: string;
  rmk_en?: string;
  data_timestamp?: string;
  dir?: string;
}

function minutesUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((t - Date.now()) / 60000));
}

export async function fetchKmbStopEta(
  stopId: string,
  route: string,
  serviceType = "1",
): Promise<LiveEta[]> {
  const data = await fetchJson<{ data: KmbEtaRow[] }>(
    kmbUrl(`eta/${stopId}/${route}/${serviceType}`),
  );
  return (data.data ?? []).map((r) => ({
    etaIso: r.eta,
    minutes: minutesUntil(r.eta),
    dest: r.dest_en || r.dest_tc || "",
    remark: r.rmk_en,
    dataTimestamp: r.data_timestamp,
  }));
}

export async function fetchCtbEta(
  stopId: string,
  route: string,
  dir?: "O" | "I",
): Promise<LiveEta[]> {
  const data = await fetchJson<{ data: CtbEtaRow[] }>(
    ctbUrl(`eta/ctb/${stopId}/${route}`),
  );
  let rows = data.data ?? [];
  if (dir) {
    const filtered = rows.filter((r) => (r.dir || "").toUpperCase() === dir);
    if (filtered.length) rows = filtered;
  }
  return rows.map((r) => ({
    etaIso: r.eta,
    minutes: minutesUntil(r.eta),
    dest: r.dest_en || r.dest_tc || "",
    remark: r.rmk_en,
    dataTimestamp: r.data_timestamp,
  }));
}

export async function fetchLegEtas(params: {
  operator: "KMB" | "CTB";
  stopId: string;
  route: string;
  serviceType?: string;
  dir?: "O" | "I";
}): Promise<LiveEta[]> {
  try {
    if (params.operator === "KMB") {
      return await fetchKmbStopEta(params.stopId, params.route, params.serviceType ?? "1");
    }
    return await fetchCtbEta(params.stopId, params.route, params.dir);
  } catch (e) {
    console.warn("ETA fetch failed", e);
    return [];
  }
}
