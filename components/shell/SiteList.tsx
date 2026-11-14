"use client";

import { ChevronDown, MapPin } from "lucide-react";
import { useState } from "react";
import { sitesFor } from "@/lib/data/sites";
import { useExplorer } from "@/lib/store";
import { cn } from "@/lib/utils";
import { WORLD_CONFIG, type World } from "@/lib/worlds";

/** Collapsible list of this world's sites (wide screens); phones use search. */
export function SiteList({ world }: { world: World }) {
  const sites = sitesFor(world);
  const selectedId = useExplorer((s) => s.selectedSiteId);
  const selectSite = useExplorer((s) => s.selectSite);
  const [open, setOpen] = useState(true);

  return (
    <div className="chrome glass pointer-events-auto absolute start-[4.75rem] top-[4.25rem] z-20 hidden w-60 overflow-hidden rounded-2xl md:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors duration-150 hover:bg-white/5"
      >
        <MapPin className="size-4 text-primary" aria-hidden />
        {WORLD_CONFIG[world].name} sites
        <span className="hud ms-1 text-xs text-muted-foreground">{sites.length}</span>
        <ChevronDown className={cn("ms-auto size-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul className="max-h-[min(40dvh,26rem)] overflow-y-auto border-t border-border p-1.5">
          {sites.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => selectSite(s.id)}
                aria-current={selectedId === s.id || undefined}
                className={cn(
                  "w-full rounded-lg px-2.5 py-2 text-start transition-colors duration-150 hover:bg-white/5",
                  selectedId === s.id && "bg-primary/10",
                )}
              >
                <span className={cn("block text-sm", selectedId === s.id && "text-primary")}>{s.name}</span>
                <span className="block text-xs text-muted-foreground">{s.region}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
