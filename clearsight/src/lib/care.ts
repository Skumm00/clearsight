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

function haversineKm(a: LatLon, b: LatLon) {
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
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => reject(new Error("Location permission was denied. Enter a ZIP code instead.")),
      { timeout: 10000, maximumAge: 5 * 60_000 },
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
  const res = await fetch(`${OVERPASS}?data=${encodeURIComponent(query)}`);
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
