"use client";

import { formatLat, formatLon } from "@/lib/geo";
import { cn } from "@/lib/utils";
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
      className={cn(
        "chrome glass hud pointer-events-none absolute bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.75rem)] start-1/2 z-10 max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-3 overflow-hidden rounded-xl px-3 py-1.5 text-[11px] whitespace-nowrap text-muted-foreground md:bottom-3 md:flex md:gap-4 md:px-4 md:py-2 md:text-xs",
        // Touch screens have no pointer to follow: on phones the readout appears once a point is tapped.
        hover ? "flex" : "hidden",
      )}
    >
      <span className="text-foreground">{WORLD_CONFIG[world].name}</span>
      <span className="w-[4.5rem] md:w-20">LAT {hover ? formatLat(hover.lat) : "--"}</span>
      <span className="w-[5rem] md:w-24">LON {hover ? formatLon(hover.lon) : "--"}</span>
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
