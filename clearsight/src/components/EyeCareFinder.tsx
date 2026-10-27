"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, MapPin, Navigation, Phone } from "lucide-react";
import { Button, Card } from "./ui";
import { findEyeCare, geocodeZip, getBrowserLocation, mapsLink, SAMPLE_CENTER, savedNearbyCare, websiteHref, type CarePlace } from "@/lib/care";

type Status = "idle" | "locating" | "loading" | "done" | "error";

export function EyeCareFinder() {
  const [status, setStatus] = useState<Status>("idle");
  const [places, setPlaces] = useState<CarePlace[]>([]);
  const [area, setArea] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zip, setZip] = useState("");
  const latest = useRef(0);

  const run = async (getOrigin: () => Promise<{ lat: number; lon: number }>) => {
    const id = ++latest.current;
    setError(null);
    setArea(null);
    let origin: { lat: number; lon: number } | null = null;
    try {
      setStatus("locating");
      origin = await getOrigin();
      if (id !== latest.current) return;
      setStatus("loading");
      const found = await findEyeCare(origin);
      if (id !== latest.current) return;
      setPlaces(found);
      setStatus("done");
    } catch (e) {
      if (id !== latest.current) return;
      const saved = origin ? savedNearbyCare(origin) : null;
      if (saved) {
        setPlaces(saved);
        setStatus("done");
        return;
      }
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("error");
    }
  };

  useEffect(() => {
    setPlaces(savedNearbyCare(SAMPLE_CENTER) ?? []);
    setArea("Stoneridge Road, Pleasanton, CA");
    setStatus("done");
  }, []);

  const busy = status === "locating" || status === "loading";
  const searching = status === "loading";

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
        <Button onClick={() => run(getBrowserLocation)} disabled={busy}>
          {busy ? <Loader2 size={18} className="mr-2 animate-spin" /> : <Navigation size={18} className="mr-2" />}
          Use my location
        </Button>
        <span className="text-center text-sm text-muted">or</span>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{5}$/.test(zip)) run(() => geocodeZip(zip));
            else setError("Enter a 5-digit US ZIP code.");
          }}
        >
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
            inputMode="numeric"
            placeholder="ZIP code"
            aria-label="ZIP code"
            className="h-12 w-32 rounded-sm border border-line bg-surface px-3 text-ink placeholder:text-muted"
          />
          <Button variant="ghost" type="submit" disabled={searching}>
            Search
          </Button>
        </form>
      </div>

      <p className="mt-3 text-center text-xs text-muted">
        Your location is only used to search OpenStreetMap for nearby clinics. Nothing is stored.
      </p>

      {status === "loading" && <p className="mt-4 text-center text-sm text-muted">Searching nearby clinics. This can take up to 10 seconds.</p>}
      {error && <p className="mt-4 text-center text-sm text-danger">{error}</p>}
      {area && places.length > 0 && <p className="mt-6 text-center text-sm text-muted">Eye care near {area}</p>}

      {status === "done" && places.length === 0 && (
        <p className="mt-6 text-center text-muted">
          No listings found nearby in OpenStreetMap.{" "}
          <a className="text-accent underline" href="https://www.google.com/maps/search/optometrist+near+me" target="_blank" rel="noreferrer">
            Search Google Maps instead
          </a>
          .
        </p>
      )}

      {places.length > 0 && (
        <ul className="mt-6 space-y-3">
          {places.map((p) => (
            <li key={p.id}>
              <Card className="flex flex-col gap-1 p-4 text-left">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{p.name}</span>
                  <span className="shrink-0 text-sm text-muted tabular-nums">{(p.distanceKm * 0.621371).toFixed(1)} mi</span>
                </div>
                <span className="text-sm text-muted">
                  {p.kind}
                  {p.address && ` · ${p.address}`}
                </span>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <a className="flex items-center gap-1.5 text-accent hover:underline" href={mapsLink(p)} target="_blank" rel="noreferrer">
                    <MapPin size={14} /> Directions
                  </a>
                  {p.phone && (
                    <a className="flex items-center gap-1.5 text-accent hover:underline" href={`tel:${p.phone}`}>
                      <Phone size={14} /> {p.phone}
                    </a>
                  )}
                  {p.website && (
                    <a className="flex items-center gap-1.5 text-accent hover:underline" href={websiteHref(p.website)} target="_blank" rel="noreferrer">
                      <ExternalLink size={14} /> Website
                    </a>
                  )}
                </div>
              </Card>
            </li>
          ))}
          <li className="pt-2 text-center text-xs text-muted">
            Listings come from OpenStreetMap and may be incomplete. Call ahead to confirm hours and whether they accept your insurance.
          </li>
        </ul>
      )}
    </div>
  );
}
