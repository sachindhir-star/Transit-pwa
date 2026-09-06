/** Prefer Vite proxy in dev; in production hit public APIs directly (CORS open on these hosts). */

const isDev = import.meta.env.DEV;

export function kmbUrl(path: string): string {
  const p = path.replace(/^\//, "");
  return isDev
    ? `/api/kmb/${p}`
    : `https://data.etabus.gov.hk/v1/transport/kmb/${p}`;
}

export function ctbUrl(path: string): string {
  const p = path.replace(/^\//, "");
  return isDev
    ? `/api/ctb/${p}`
    : `https://rt.data.gov.hk/v2/transport/citybus/${p}`;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}
