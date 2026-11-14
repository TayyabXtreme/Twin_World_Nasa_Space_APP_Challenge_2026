"use client";

import { MapPin } from "lucide-react";
import { useState } from "react";
import { GetTheData } from "@/components/data/GetTheData";
import { STATIC_PLACES } from "@/lib/data/globePlaces";
import { sitesFor } from "@/lib/data/sites";

/** Data Lab: pick any named Earth place (or type coordinates) and list the NASA granules that cover it. */

const OPTIONS = [
  ...sitesFor("earth").map((s) => ({ id: s.id, name: s.name, region: s.region, lat: s.lat, lon: s.lon, group: "Analogue sites" })),
  ...STATIC_PLACES.map((p) => ({ id: p.id, name: p.name, region: p.region, lat: p.lat, lon: p.lon, group: "Globe places" })),
];
const GROUPS = [...new Set(OPTIONS.map((o) => o.group))];

export function GetDataSection() {
  const [spot, setSpot] = useState({ name: OPTIONS[0].name, lat: OPTIONS[0].lat, lon: OPTIONS[0].lon });
  const [pickId, setPickId] = useState(OPTIONS[0].id);
  const [lat, setLat] = useState(String(OPTIONS[0].lat));
  const [lon, setLon] = useState(String(OPTIONS[0].lon));
  const la = Number(lat);
  const lo = Number(lon);
  const valid = lat.trim() !== "" && lon.trim() !== "" && Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180;

  const pick = (id: string) => {
    const o = OPTIONS.find((x) => x.id === id)!;
    setPickId(id);
    setLat(String(o.lat));
    setLon(String(o.lon));
    setSpot({ name: o.name, lat: o.lat, lon: o.lon });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
      <form
        className="glass flex flex-col gap-3 self-start rounded-2xl p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          setPickId("");
          setSpot({ name: `${la.toFixed(3)}°, ${lo.toFixed(3)}°`, lat: la, lon: lo });
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Place
          <select
            value={pickId}
            onChange={(e) => e.target.value && pick(e.target.value)}
            className="rounded-lg bg-white/[0.05] px-2.5 py-2 text-sm text-foreground ring-1 ring-white/10 outline-none focus-visible:ring-primary"
          >
            <option value="" className="bg-background">
              Custom coordinates
            </option>
            {GROUPS.map((g) => (
              <optgroup key={g} label={g} className="bg-background">
                {OPTIONS.filter((o) => o.group === g).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} · {o.region}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Latitude
            <input
              inputMode="decimal"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="hud rounded-lg bg-white/[0.05] px-2.5 py-2 text-sm text-foreground ring-1 ring-white/10 outline-none focus-visible:ring-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Longitude
            <input
              inputMode="decimal"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              className="hud rounded-lg bg-white/[0.05] px-2.5 py-2 text-sm text-foreground ring-1 ring-white/10 outline-none focus-visible:ring-primary"
            />
          </label>
        </div>
        {!valid && <p className="text-xs text-warn">Latitude must be −90 to 90 and longitude −180 to 180 (decimal degrees).</p>}
        <button
          type="submit"
          disabled={!valid}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-[background-color,scale] duration-150 hover:bg-primary/90 active:scale-[0.98] disabled:opacity-40"
        >
          <MapPin className="size-4" aria-hidden />
          Search these coordinates
        </button>
        <p className="text-[11px] leading-snug text-muted-foreground">Tip: click any spot on the Explore globe or map for the same panel there.</p>
      </form>
      <div className="glass rounded-2xl p-4">
        <h3 className="mb-2 font-heading text-lg font-semibold tracking-tight">{spot.name}</h3>
        <GetTheData key={`${spot.lat},${spot.lon}`} lat={spot.lat} lon={spot.lon} name={spot.name} />
      </div>
    </div>
  );
}
