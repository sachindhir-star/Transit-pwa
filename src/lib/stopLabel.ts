/** Split operator stop names like "IFC Mall, Finance Street" into title + street. */

export function stopLocationParts(name: string): { title: string; street?: string } {
  const raw = (name || "").trim();
  if (!raw) return { title: "Boarding stop" };
  const comma = raw.indexOf(",");
  if (comma > 0 && comma < raw.length - 1) {
    const title = raw.slice(0, comma).trim();
    const street = raw.slice(comma + 1).trim();
    if (title && street) return { title, street };
  }
  return { title: raw };
}

export function shortStopName(name: string): string {
  return stopLocationParts(name).title;
}
