"use client";

import { formatLat, formatLon } from "@/lib/geo";
import { useExplorer } from "@/lib/store";
import { useLookup } from "@/lib/useLookup";
import { WORLD_CONFIG, type World } from "@/lib/worlds";

/** Bottom readout: coordinates, the named place and (Moon/Mars) elevation under the pointer. */
export function Hud({ world }: { world: World }) {
  const hover = useExplorer((s) => s.hover);
  const lookup = useLookup(world);
  const place = hover && lookup ? lookup(hover.lat, hover.lon) : null;

  return (
    <div
      aria-live="off"
      className="chrome glass hud pointer-events-none absolute bottom-[calc(5.5rem+env(safe-area-inset-bottom))] start-1/2 z-10 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-4 overflow-hidden rounded-xl px-4 py-2 text-xs whitespace-nowrap text-muted-foreground md:bottom-3"
    >
      <span className="text-foreground">{WORLD_CONFIG[world].name}</span>
      <span className="w-20">LAT {hover ? formatLat(hover.lat) : "--"}</span>
      <span className="w-24">LON {hover ? formatLon(hover.lon) : "--"}</span>
      {place?.elevationM !== undefined && <span>ELEV {place.elevationM.toLocaleString("en-GB")} m</span>}
      {place?.label && (
        <span className="truncate text-primary">
          {place.label}
          {place.sublabel && <span className="ms-2 text-muted-foreground">{place.sublabel}</span>}
        </span>
      )}
    </div>
  );
}
