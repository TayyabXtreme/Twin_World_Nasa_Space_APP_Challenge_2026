"use client";

import { Check, Clapperboard, Layers } from "lucide-react";
import { useEffect } from "react";
import { GLOBE_LAYERS, layerOf, type GlobeLayerId } from "@/lib/data/globe";
import { placeById, PLACES } from "@/lib/data/globePlaces";
import { siteById, sitesFor } from "@/lib/data/sites";
import { useExplorer } from "@/lib/store";
import { cn } from "@/lib/utils";
import { startTour } from "./CinematicTour";

const COUNTS = Object.fromEntries(
  GLOBE_LAYERS.map((l) => [l.id, sitesFor("earth").filter((s) => layerOf(s) === l.id).length + PLACES.filter((p) => p.layer === l.id).length]),
) as Record<GlobeLayerId, number>;

/** Layer of whatever is selected (site or place), if it is on Earth. */
function selectedLayer(siteId: string | null, placeId: string | null): GlobeLayerId | undefined {
  const site = siteId ? siteById(siteId) : undefined;
  if (site?.world === "earth") return layerOf(site);
  return placeId ? placeById(placeId)?.layer : undefined;
}

/**
 * Earth pin layers and the cinematic tour. Bottom-left panel on wide screens; on phones a scrolling chip row under
 * the top bar, with the tour first.
 */
export function LayerToggles() {
  const hidden = useExplorer((s) => s.hiddenLayers);
  const toggleLayer = useExplorer((s) => s.toggleLayer);
  const selectedSiteId = useExplorer((s) => s.selectedSiteId);
  const selectedPlaceId = useExplorer((s) => s.selectedPlaceId);
  const selectSite = useExplorer((s) => s.selectSite);

  // Picking something from search or the list shows its layer again, so its pin is never invisible.
  useEffect(() => {
    const layer = selectedLayer(selectedSiteId, selectedPlaceId);
    if (layer && useExplorer.getState().hiddenLayers.includes(layer)) toggleLayer(layer);
  }, [selectedSiteId, selectedPlaceId, toggleLayer]);

  const onToggle = (id: GlobeLayerId) => {
    // Hiding the layer of the open card closes the card.
    if (!hidden.includes(id) && selectedLayer(selectedSiteId, selectedPlaceId) === id) selectSite(null);
    toggleLayer(id);
  };

  return (
    <div
      role="group"
      aria-label="Map layers"
      className={cn(
        "chrome pointer-events-auto absolute z-20 flex gap-1.5 overflow-x-auto [scrollbar-width:none]",
        "inset-x-0 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.25rem)] px-3 pb-1",
        "[mask-image:linear-gradient(to_right,transparent,black_0.75rem,black_calc(100%-2rem),transparent)] md:[mask-image:none] md:px-1.5 md:pb-1.5",
        "md:glass md:inset-x-auto md:start-[4.75rem] md:top-auto md:bottom-3 md:w-64 md:flex-col md:gap-0.5 md:overflow-visible md:rounded-2xl md:p-1.5",
      )}
    >
      <div className="hidden items-center gap-2 px-2 pt-1 pb-1 md:flex">
        <Layers className="size-3.5 text-primary" aria-hidden />
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Layers</span>
      </div>
      <button
        type="button"
        onClick={startTour}
        className={cn(
          "flex shrink-0 items-center gap-2 rounded-xl text-xs font-medium transition-[background-color,scale] duration-150 ease-(--ease-out) active:scale-[0.97]",
          "h-9 bg-primary px-3 text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] hover:bg-primary/90 md:h-auto",
          "md:order-last md:mt-1 md:justify-center md:py-2.5 md:text-sm",
        )}
      >
        <Clapperboard className="size-4" aria-hidden />
        Cinematic tour
      </button>
      {GLOBE_LAYERS.map((l) => {
        const on = !hidden.includes(l.id);
        return (
          <button
            key={l.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(l.id)}
            title={l.hint}
            className={cn(
              "group flex shrink-0 items-center gap-2.5 rounded-xl text-start whitespace-nowrap transition-[background-color,opacity,scale] duration-150 ease-(--ease-out) active:scale-[0.97]",
              "glass h-9 px-3 text-xs md:h-auto md:border-transparent md:bg-transparent md:px-2 md:py-1.5 md:text-sm md:[backdrop-filter:none] md:hover:bg-white/5",
              !on && "opacity-55",
            )}
          >
            <span
              className="relative flex size-4 shrink-0 items-center justify-center rounded-full ring-2 transition-colors duration-150"
              style={{ "--tw-ring-color": l.color, backgroundColor: on ? l.color : "transparent" } as React.CSSProperties}
              aria-hidden
            >
              <Check className={cn("size-3 text-background transition-[opacity,scale] duration-150", on ? "scale-100 opacity-100" : "scale-50 opacity-0")} strokeWidth={3} />
            </span>
            <span className="min-w-0 flex-1 leading-tight font-medium">{l.label}</span>
            <span className="hud text-[11px] text-muted-foreground md:text-xs">{l.id === "iss" ? "live" : COUNTS[l.id]}</span>
          </button>
        );
      })}
    </div>
  );
}
