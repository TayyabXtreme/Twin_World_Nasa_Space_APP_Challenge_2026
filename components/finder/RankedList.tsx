"use client";

import type { PlaceLabel } from "@/lib/finder/places";
import { DIM_LABEL } from "@/lib/finder/text";
import type { CellResult, DimId } from "@/lib/finder/types";
import { cn } from "@/lib/utils";

function bestDims(c: CellResult) {
  return (Object.entries(c.sims) as [DimId, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([d]) => DIM_LABEL[d]);
}

export function RankedList({
  top,
  labels,
  selected,
  onSelect,
  stamp,
}: {
  top: CellResult[];
  labels: PlaceLabel[];
  selected: number | null;
  onSelect: (i: number) => void;
  /** Changes with every new ranking so the list cross-fades. */
  stamp: string;
}) {
  return (
    <section aria-labelledby="rank-title">
      <h2 id="rank-title" className="font-heading text-lg font-semibold">
        Top 10 distinct places
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Best cells at least 350 km apart, so each is a different place.
      </p>
      <ol key={stamp} className="finder-fade mt-4 grid gap-1.5">
        {top.map((c, i) => {
          const l = labels[i];
          const active = selected === i;
          return (
            <li key={c.cell} className="finder-rise" style={{ "--d": `${i * 35}ms` } as React.CSSProperties}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={active || undefined}
                className={cn(
                  "grid w-full grid-cols-[1.75rem_1fr_auto] items-center gap-3 rounded-2xl px-2.5 py-2.5 text-start ring-1 transition-[background-color,box-shadow] duration-150",
                  active
                    ? "bg-primary/[0.08] ring-primary/40"
                    : "ring-transparent hover:bg-white/[0.04] hover:ring-white/10",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full hud text-xs ring-1",
                    active ? "bg-warn text-background ring-warn" : "text-foreground/85 ring-white/20",
                  )}
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-medium">{l?.title ?? "…"}</span>
                    {l?.known && (
                      <span className="shrink-0 rounded-full bg-ok/15 px-1.5 py-px text-[10px] text-ok">known</span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {l?.subtitle} · {bestDims(c).join(", ")}
                  </span>
                </span>
                <span className="text-end hud text-sm">{Math.round(c.score * 100)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
