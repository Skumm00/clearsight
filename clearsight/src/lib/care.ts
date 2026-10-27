import { PLEASANTON_SAMPLE, SAMPLE_CENTER } from "@/data/careSample";

export interface CarePlace {
  id: string;
  name: string;
  kind: string;
  address: string;
  phone?: string;
  website?: string;
  distanceKm: number;
  lat: number;
  lon: number;
}

export interface LatLon {
  lat: number;
  lon: number;
}

const OVERPASS = "https://overpass-api.de/api/interpreter";
const SEARCH_TIMEOUT_MS = 15000;

export function haversineKm(a: LatLon, b: LatLon) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function geocodeZip(zip: string): Promise<LatLon> {
  const url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(zip)}&country=us&format=json&limit=1`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Could not look up that ZIP code.");
  const data = (await res.json()) as { lat: string; lon: string }[];
  if (!data.length) throw new Error("No match for that ZIP code.");
  return { lat: Number(data[0].lat), lon: Number(data[0].lon) };
}

export function getBrowserLocation(): Promise<LatLon> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location is not available in this browser."));
    // The browser's own timeout only starts after the permission prompt is answered, so add one that always fires.
    const guard = setTimeout(
      () => reject(new Error("No answer from the location prompt. Allow location in the address bar, or enter a ZIP code instead.")),
      12000,
    );
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(guard);
        resolve({ lat: p.coords.latitude, lon: p.coords.longitude });
      },
      (err) => {
        clearTimeout(guard);
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Location is blocked. Allow it in the address bar (lock icon) and in macOS Privacy settings, or enter a ZIP code."
              : err.code === err.TIMEOUT
                ? "Finding your location took too long. Enter a ZIP code instead."
                : "Your computer couldn’t work out its location. Enter a ZIP code instead.",
          ),
        );
      },
      { timeout: 15000, maximumAge: 5 * 60_000 },
    );
  });
}

function describeKind(tags: Record<string, string>) {
  if (tags.shop === "optician") return "Optician / eyewear";
  if (tags.healthcare === "optometrist") return "Optometrist";
  if (/ophthalm/i.test(tags["healthcare:speciality"] ?? "")) return "Ophthalmologist";
  return "Eye care";
}

export async function findEyeCare(origin: LatLon, radiusM = 10000): Promise<CarePlace[]> {
  const around = `(around:${radiusM},${origin.lat},${origin.lon})`;
  const query = `[out:json][timeout:25];(nwr["healthcare"="optometrist"]${around};nwr["shop"="optician"]${around};nwr["healthcare:speciality"~"ophthalm|optom"]${around};);out center tags 60;`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${OVERPASS}?data=${encodeURIComponent(query)}`, { signal: controller.signal });
  } catch {
    throw new Error("The clinic directory is busy right now. Please try again in a moment.");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error("The clinic directory is busy. Please try again in a moment.");
  const json = (await res.json()) as {
    elements: { type: string; id: number; lat?: number; lon?: number; center?: LatLon; tags?: Record<string, string> }[];
  };

  const places: CarePlace[] = [];
  for (const e of json.elements) {
    const t = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (!t.name || lat === undefined || lon === undefined) continue;
    const address = [[t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" "), t["addr:city"]].filter(Boolean).join(", ");
    places.push({
      id: `${e.type}${e.id}`,
      name: t.name,
      kind: describeKind(t),
      address,
      phone: t.phone ?? t["contact:phone"],
      website: t.website ?? t["contact:website"],
      distanceKm: haversineKm(origin, { lat, lon }),
      lat,
      lon,
    });
  }
  return places.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 12);
}

export function mapsLink(p: CarePlace) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.address}`.trim())}&center=${p.lat},${p.lon}`;
}

export function websiteHref(url: string) {
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

/** Saved results for the Pleasanton, CA area, with distances from the given origin. Only used when the origin is nearby. */
export function savedNearbyCare(origin: LatLon): CarePlace[] | null {
  if (haversineKm(origin, SAMPLE_CENTER) > 25) return null;
  return PLEASANTON_SAMPLE.map((p) => ({ ...p, distanceKm: haversineKm(origin, p) })).sort((a, b) => a.distanceKm - b.distanceKm);
}

export { SAMPLE_CENTER };
