"use client";

import { CloudDownload, Flame, Mountain, Radar, Snowflake, Sparkles, type LucideIcon } from "lucide-react";
import { useMoonbase } from "@/lib/moonbase/store";
import type { LayerMeta } from "@/lib/moonbase/types";
import { cn } from "@/lib/utils";
import { rampCss } from "./MapLegend";

const GROUP_ICON: Record<string, LucideIcon> = { Terrain: Mountain, "Ice & temperature": Snowflake, Surface: Radar };
const STATUS_TEXT: Record<string, string> = {
  downloading: "Coming soon: data still downloading",
  no_coverage: "No polar coverage",
  missing: "Not downloaded",
};

/** Layer switcher, grouped like the datasets, with honest states for layers we cannot show yet. */
export function LayerPanel({ layers, onPickScore }: { layers: LayerMeta[]; onPickScore: () => void }) {
  const active = useMoonbase((s) => s.activeLayer);
  const setActive = useMoonbase((s) => s.setActiveLayer);
  const groups = [...new Set(layers.map((l) => l.group))];

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={onPickScore}
        className={cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition-colors duration-150",
          active === "suitability" ? "bg-primary/12 ring-primary/50" : "ring-white/10 hover:bg-white/[0.05] hover:ring-white/20",
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">Base suitability</span>
          <span className="block text-xs text-muted-foreground">Your weights, computed live from the layers below</span>
        </span>
      </button>

      {groups.map((g) => {
        const Icon = GROUP_ICON[g] ?? Flame;
        return (
          <div key={g}>
            <p className="flex items-center gap-1.5 px-1 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
              <Icon className="size-3.5" aria-hidden /> {g}
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {layers
                .filter((l) => l.group === g)
                .map((l) => {
                  const ready = l.status === "ready" && Boolean(l.image);
                  const on = active === l.id;
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        disabled={!ready}
                        aria-pressed={on}
                        onClick={() => setActive(l.id)}
                        className={cn(
                          "w-full rounded-xl px-3 py-2 text-left transition-colors duration-150",
                          on ? "bg-white/[0.08] ring-1 ring-primary/45" : "ring-1 ring-transparent",
                          ready ? "hover:bg-white/[0.05]" : "cursor-not-allowed",
                        )}
                      >
                        <span className="flex items-center gap-3">
                          <span
                            className={cn("mb-ramp h-5 w-8 shrink-0 rounded-md ring-1 ring-white/10", !ready && "opacity-35 grayscale")}
                            style={{ ["--ramp" as string]: rampCss(l.ramp) }}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className={cn("block truncate text-sm", ready ? "font-medium" : "text-muted-foreground")}>{l.label}</span>
                            {!ready && (
                              <span
                                className={cn(
                                  "mt-0.5 inline-flex items-center gap-1 text-[11px]",
                                  l.status === "downloading" ? "text-warn" : "text-muted-foreground",
                                )}
                              >
                                {l.status === "downloading" && <CloudDownload className="size-3" aria-hidden />}
                                {STATUS_TEXT[l.status] ?? l.status}
                                {l.status === "no_coverage" && l.coverage ? ` (ends at ${Math.abs(l.coverage[0])}°S)` : ""}
                              </span>
                            )}
                          </span>
                          <span className="hud shrink-0 text-[11px] text-muted-foreground">{l.units}</span>
                        </span>
                        {on && (
                          <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">
                            {l.what}
                            <span className="mt-1.5 block text-[11px] text-foreground/60">
                              {l.dataset.name} · {l.resolution}
                            </span>
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
