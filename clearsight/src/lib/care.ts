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

const OVERPASS_HOSTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const OVERPASS_TIMEOUT_MS = 9000;
const NOT_EYE_CARE = /sunglass|oakley|solaris|ray-?ban/i;

type OverpassElement = { type: string; id: number; lat?: number; lon?: number; center?: LatLon; tags?: Record<string, string> };

function boundingBox(origin: LatLon, radiusKm: number) {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos((origin.lat * Math.PI) / 180));
  return { south: origin.lat - dLat, north: origin.lat + dLat, west: origin.lon - dLon, east: origin.lon + dLon };
}

/** Asks several Overpass servers at once and uses whichever answers first. */
async function queryOverpass(origin: LatLon, radiusKm: number): Promise<OverpassElement[]> {
  const { south, west, north, east } = boundingBox(origin, radiusKm);
  const query = `[out:json][timeout:8][bbox:${south},${west},${north},${east}];(nwr["healthcare"="optometrist"];nwr["shop"="optician"];nwr["healthcare:speciality"~"ophthalm|optom"];);out center tags 60;`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
  try {
    return await Promise.any(
      OVERPASS_HOSTS.map(async (host) => {
        const res = await fetch(`${host}?data=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Overpass ${res.status}`);
        return ((await res.json()) as { elements: OverpassElement[] }).elements;
      }),
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function fromOverpass(elements: OverpassElement[], origin: LatLon): CarePlace[] {
  const places: CarePlace[] = [];
  for (const e of elements) {
    const t = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (!t.name || lat === undefined || lon === undefined || NOT_EYE_CARE.test(t.name)) continue;
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
  return places;
}

interface NominatimResult {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  name?: string;
  type?: string;
  display_name: string;
  address?: { house_number?: string; road?: string; city?: string; town?: string };
}

/** Backup source: Nominatim answers quickly and covers fewer places, with no phone numbers or websites. */
async function queryNominatim(origin: LatLon, radiusKm: number): Promise<CarePlace[]> {
  const { south, west, north, east } = boundingBox(origin, radiusKm);
  const search = async (q: string) => {
    const url =
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&limit=30&bounded=1` +
      `&viewbox=${west},${north},${east},${south}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    return (await res.json()) as NominatimResult[];
  };
  const [optometrists, opticians] = await Promise.all([search("optometrist"), search("optician")]);
  const seen = new Set<string>();
  const places: CarePlace[] = [];
  for (const r of [...optometrists, ...opticians]) {
    const id = `${r.osm_type}${r.osm_id}`;
    const name = r.name ?? r.display_name.split(",")[0];
    if (seen.has(id) || NOT_EYE_CARE.test(name)) continue;
    seen.add(id);
    const lat = Number(r.lat);
    const lon = Number(r.lon);
    const a = r.address ?? {};
    places.push({
      id,
      name,
      kind: r.type === "optician" ? "Optician / eyewear" : "Optometrist",
      address: [[a.house_number, a.road].filter(Boolean).join(" "), a.city ?? a.town].filter(Boolean).join(", "),
      distanceKm: haversineKm(origin, { lat, lon }),
      lat,
      lon,
    });
  }
  return places;
}

/** Nearby optometrists, opticians and ophthalmologists from OpenStreetMap data (coverage varies by area). */
export async function findEyeCare(origin: LatLon, radiusKm = 10): Promise<CarePlace[]> {
  let places: CarePlace[] = [];
  try {
    places = fromOverpass(await queryOverpass(origin, radiusKm), origin);
  } catch {
    /* every Overpass server was busy or slow, so use the backup source below */
  }
  if (places.length === 0) {
    try {
      places = await queryNominatim(origin, radiusKm);
    } catch {
      throw new Error("The clinic directory is busy right now. Please try again in a moment.");
    }
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
