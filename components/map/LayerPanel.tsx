"use client";

import {
  Atom,
  ChevronDown,
  Droplets,
  Flame,
  Haze,
  Layers,
  Leaf,
  Mountain,
  Radar,
  Snowflake,
  Sun,
  Thermometer,
  Wind,
  Boxes,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { baseLayersFor, scienceLayersFor, type LayerKind, type Legend, type MapLayer } from "@/lib/layers";
import { useExplorer } from "@/lib/store";
import { cn } from "@/lib/utils";
import { WORLD_CONFIG, type World } from "@/lib/worlds";
import { LegendBody, LegendHeader, RampBar, rampGradient } from "./LegendCard";
import { ensureLegend, useMapLayers } from "./science";

const KIND_ICON: Partial<Record<LayerKind, LucideIcon>> = {
  water: Droplets,
  hydrogen: Atom,
  temperature: Thermometer,
  thermal: Flame,
  slope: Mountain,
  rocks: Boxes,
  radar: Radar,
  ice: Sun,
  vegetation: Leaf,
  snow: Snowflake,
  aerosol: Haze,
  dust: Wind,
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-1 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{children}</p>;
}

/** Base maps (one always on) and science overlays (one or none), shared by the desktop panel and the phone sheet. */
function LayerLists({ world, onPick }: { world: World; onPick?: () => void }) {
  const bases = useMemo(() => baseLayersFor(world), [world]);
  const science = useMemo(() => scienceLayersFor(world), [world]);
  const chosenBase = useMapLayers((s) => s.base[world]) ?? bases[0]?.id;
  const setBase = useMapLayers((s) => s.setBase);
  const legends = useMapLayers((s) => s.legends);
  const activeId = useExplorer((s) => s.activeLayerId);
  const setActive = useExplorer((s) => s.setActiveLayer);

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Base map">
        <SectionLabel>Base map</SectionLabel>
        <div className="flex flex-wrap gap-1">
          {bases.map((l) => {
            const on = l.id === chosenBase;
            return (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setBase(world, l.id)}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-xs transition-colors duration-150",
                  on ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-white/5 hover:text-foreground",
                )}
              >
                {l.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <SectionLabel>Science data</SectionLabel>
        <ul className="space-y-0.5">
          {science.map((l) => {
            const legend = legends[l.id];
            const missing = legend === null;
            const on = l.id === activeId;
            const Icon = KIND_ICON[l.kind] ?? Layers;
            return (
              <li key={l.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={missing}
                  onClick={() => {
                    setActive(on ? null : l.id);
                    onPick?.();
                  }}
                  title={legend?.dataset}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-start text-xs transition-colors duration-150 md:py-1.5",
                    on ? "bg-primary/10 text-primary" : "text-foreground/90 hover:bg-white/5",
                    missing && "cursor-not-allowed opacity-50 hover:bg-transparent",
                  )}
                >
                  <Icon className={cn("size-3.5 shrink-0", on ? "text-primary" : "text-muted-foreground")} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{l.label}</span>
                  {missing ? (
                    <span className="text-[10px] text-muted-foreground">not built</span>
                  ) : (
                    <span
                      className={cn("h-1.5 w-9 shrink-0 rounded-full ring-1 ring-white/10", !legend?.ramp && "bg-white/10")}
                      style={legend?.ramp ? { backgroundImage: rampGradient(legend.ramp) } : undefined}
                      aria-hidden
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function useActive(world: World): { layer?: MapLayer; legend?: Legend | null } {
  const activeId = useExplorer((s) => s.activeLayerId);
  const layer = useMemo(() => scienceLayersFor(world).find((l) => l.id === activeId), [world, activeId]);
  const legend = useMapLayers((s) => (layer ? s.legends[layer.id] : undefined));
  return { layer, legend };
}

/**
 * Layer panel and legend for the 2D map. Wide screens: a collapsible card on the right with the legend card under it.
 * Phones: a compact legend strip and a Layers button above the HUD that open a bottom sheet with everything.
 */
export function LayerPanel({ world }: { world: World }) {
  const [open, setOpen] = useState(true);
  const [sheet, setSheet] = useState(false);
  const setActive = useExplorer((s) => s.setActiveLayer);
  const { layer, legend } = useActive(world);
  const pin = useMapLayers((s) => s.pinProbe);
  // Site, place and point cards take the same right-hand slot (components/site); step aside while one is open.
  const cardOpen = useExplorer((s) => Boolean(s.selectedSiteId || s.selectedPlaceId || s.dataPoint));

  // Legends are a few kB each: fetch this world's set so the list can show colour ramps. Images load only when used.
  useEffect(() => {
    for (const l of scienceLayersFor(world)) ensureLegend(l.id);
  }, [world]);

  const close = () => setActive(null);

  return (
    <>
      {/* Wide screens (bottom edge leaves room for Rovi, components/rovi) */}
      <div
        aria-hidden={cardOpen || undefined}
        inert={cardOpen}
        className={cn(
          "chrome pointer-events-none absolute end-3 top-[4.25rem] bottom-[7rem] z-[1000] hidden w-[19rem] flex-col gap-2 transition-[opacity,translate,visibility] duration-200 ease-out md:flex",
          cardOpen && "invisible translate-x-4 opacity-0",
        )}
      >
        <section aria-label="Map layers" data-rovi-spot="map-layers" className="glass pointer-events-auto shrink-0 overflow-hidden rounded-2xl">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors duration-150 hover:bg-white/5"
          >
            <Layers className="size-4 text-primary" aria-hidden />
            Map layers
            <span className="text-xs font-normal text-muted-foreground">{WORLD_CONFIG[world].name}</span>
            <ChevronDown className={cn("ms-auto size-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} aria-hidden />
          </button>
          {open && (
            <div className="max-h-[min(46dvh,24rem)] overflow-y-auto overscroll-contain border-t border-border p-2.5">
              <LayerLists world={world} />
            </div>
          )}
        </section>
        {layer && legend && (
          <section
            key={layer.id}
            aria-label={`${legend.title} legend`}
            className="glass pointer-events-auto min-h-0 overflow-y-auto overscroll-contain rounded-2xl p-3 animate-in fade-in slide-in-from-top-1 duration-200"
          >
            <LegendHeader title={legend.title} onClose={close} />
            <div className="mt-2.5">
              <LegendBody layer={layer} legend={legend} />
            </div>
          </section>
        )}
      </div>

      {/* Phones */}
      <div
        className={cn(
          "chrome pointer-events-none absolute inset-x-3 bottom-[calc(8.25rem+env(safe-area-inset-bottom))] z-[1000] flex items-end justify-end gap-2 md:hidden",
          cardOpen && "hidden",
        )}
      >
        {layer && legend && (
          <button
            type="button"
            onClick={() => setSheet(true)}
            className="glass pointer-events-auto min-w-0 flex-1 rounded-xl px-3 py-2 text-start animate-in fade-in duration-200"
          >
            <span className="mb-1 flex items-baseline gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{legend.title}</span>
              {pin?.status === "value" && <span className="hud shrink-0 text-primary">{pin.text}</span>}
              {pin && pin.status !== "value" && pin.status !== "loading" && <span className="shrink-0 text-muted-foreground">no data</span>}
            </span>
            <RampBar legend={legend} compact />
          </button>
        )}
        <button
          type="button"
          onClick={() => setSheet(true)}
          aria-label="Map layers"
          className="glass pointer-events-auto flex size-11 shrink-0 items-center justify-center rounded-xl text-foreground transition-colors duration-150 hover:bg-white/10"
        >
          <Layers className="size-5" />
        </button>
      </div>
      <Drawer open={sheet} onOpenChange={setSheet}>
        <DrawerContent className="glass border-border md:hidden">
          <DrawerHeader className="pb-2 text-start">
            <DrawerTitle>Map layers · {WORLD_CONFIG[world].name}</DrawerTitle>
            <DrawerDescription className="text-xs">One base map, plus one NASA science layer on top.</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <LayerLists world={world} />
            {layer && legend && (
              <section aria-label={`${legend.title} legend`} className="mt-4 border-t border-border pt-3">
                <LegendHeader title={legend.title} onClose={close} />
                <div className="mt-2.5">
                  <LegendBody layer={layer} legend={legend} />
                </div>
              </section>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
