"use client";

import { Crosshair, X } from "lucide-react";
import { useEffect } from "react";
import { GetTheData } from "@/components/data/GetTheData";
import { SatelliteView } from "@/components/satellite/SatelliteView";
import { formatLat, formatLon } from "@/lib/geo";
import { useExplorer } from "@/lib/store";
import { useLookup } from "@/lib/useLookup";
import { cn } from "@/lib/utils";

/** Card for any Earth spot clicked on the globe or map: its satellite view and the NASA granules that cover it. */
export function PointDrawer() {
  const point = useExplorer((s) => s.dataPoint);
  const touring = useExplorer((s) => s.tourStep !== null);
  const world = useExplorer((s) => s.world);
  const setDataPoint = useExplorer((s) => s.setDataPoint);
  const lookup = useLookup("earth");

  useEffect(() => {
    if (!point) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDataPoint(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [point, setDataPoint]);

  if (!point || touring || world !== "earth") return null;
  const place = lookup?.(point.lat, point.lon);
  const name = place?.label ?? "This spot";

  return (
    <aside
      key={`${point.lat},${point.lon}`}
      aria-label="Selected point details"
      className={cn(
        "pointer-events-auto absolute z-30 flex flex-col overflow-hidden glass",
        "inset-x-0 bottom-0 max-h-[72dvh] animate-in rounded-t-2xl duration-200 fade-in slide-in-from-bottom-6",
        "md:inset-x-auto md:end-3 md:top-[4.25rem] md:bottom-[7rem] md:max-h-none md:w-[400px] md:rounded-2xl md:slide-in-from-bottom-0 md:slide-in-from-right-6",
      )}
    >
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <Crosshair className="size-3.5 text-primary" aria-hidden />
        <span className="text-xs text-muted-foreground">Selected point</span>
        <button
          type="button"
          onClick={() => setDataPoint(null)}
          className="ms-auto rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-white/10 hover:text-foreground"
          aria-label="Close details"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-5">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">{name}</h2>
        {place?.sublabel && <p className="text-sm text-muted-foreground">{place.sublabel}</p>}
        <p className="mt-1 hud text-xs text-muted-foreground">
          {formatLat(point.lat)} · {formatLon(point.lon)}
        </p>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-foreground/90">
          Any spot on Earth can be checked: what satellites see here now, and which NASA data files cover it.
        </p>
        <div className="mt-5 flex flex-col gap-4">
          <section className="border-t border-border pt-4">
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Satellite view</h3>
            <SatelliteView key={`sv-${point.lat},${point.lon}`} lat={point.lat} lon={point.lon} name={name} />
          </section>
          <section className="border-t border-border pt-4">
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Get the data</h3>
            <GetTheData key={`gd-${point.lat},${point.lon}`} lat={point.lat} lon={point.lon} name={name} />
          </section>
        </div>
      </div>
    </aside>
  );
}
