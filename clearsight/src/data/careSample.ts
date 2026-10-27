import type { CarePlace } from "@/lib/care";

/** Saved OpenStreetMap listings near Stoneridge Road, Pleasanton, CA. Used when the live search is unavailable. */
export const SAMPLE_CENTER = { lat: 37.6965, lon: -121.929 };

export const PLEASANTON_SAMPLE: Omit<CarePlace, "distanceKm">[] = [
  {
    id: "node5110354853",
    name: "Optometrist (7204 Regional Street)",
    kind: "Optometrist",
    address: "7204 Regional Street",
    phone: "+1 925 803-1010",
    website: "http://www.rogerchanod.net/",
    lat: 37.704911,
    lon: -121.9356667,
  },
  {
    id: "node5170017448",
    name: "Iron Horse Optometric Group",
    kind: "Optometrist",
    address: "7197 Village Parkway",
    phone: "+1 925 828-9511",
    website: "http://ironhorseoptometry.com/",
    lat: 37.7098431,
    lon: -121.9264345,
  },
  {
    id: "node13241315718",
    name: "Treehouse Eyes",
    kind: "Optometrist",
    address: "",
    lat: 37.6769472,
    lon: -121.8962319,
  },
  {
    id: "node11975110320",
    name: "Site for Sore Eyes",
    kind: "Optician / eyewear",
    address: "",
    lat: 37.7049503,
    lon: -121.8807262,
  },
  {
    id: "node12904106100",
    name: "Vision One Optometry",
    kind: "Optometrist",
    address: "",
    website: "https://www.vision1docs.com",
    lat: 37.6594913,
    lon: -121.8758139,
  },
  {
    id: "node6025861379",
    name: "IMAGINE Optometry",
    kind: "Optometrist",
    address: "3860 Dublin Boulevard, Dublin",
    lat: 37.7049863,
    lon: -121.8515913,
  },
];
