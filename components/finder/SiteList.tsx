"use client";

import { cn } from "@/lib/utils";
import type { SiteRow } from "./SiteTable";

const scoreTone = (s: number) => (s >= 75 ? "text-ok" : s >= 50 ? "text-primary" : "text-warn");

/**
 * The compact ranked list beside the map: rank, name, region and score only. Search, sort, confidence and CSV
 * export live in the full table under "Go deeper".
 */
export function SiteList({
  mode,
  onMode,
  namedCount,
  newCount,
  rows,
  selectedId,
  onSelect,
}: {
  mode: "named" | "new";
  onMode: (m: "named" | "new") => void;
  namedCount: number;
  newCount: number;
  rows: SiteRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section
      aria-labelledby="site-list-title"
      className="flex min-h-0 flex-col overflow-hidden rounded-[1.6rem] bg-white/[0.03] ring-1 ring-white/10"
    >
      <div className="border-b border-white/[0.07] px-4 pt-4 pb-3">
        <h2 id="site-list-title" className="font-heading text-base font-semibold">
          Best matches
        </h2>
        <div
          role="tablist"
          aria-label="Which places to rank"
          className="mt-2.5 flex rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/10"
        >
          {(
            [
              ["named", `Known sites (${namedCount})`],
              ["new", `New finds (${newCount})`],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => onMode(m)}
              className={cn(
                "flex-1 rounded-lg px-2 py-1.5 text-[13px] transition-[background-color,color] duration-150",
                mode === m
                  ? "bg-white/[0.1] text-foreground ring-1 ring-white/15"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
          {mode === "named"
            ? "Real field and analogue sites."
            : "Top-scoring places nobody has called an analogue yet."}
        </p>
      </div>
      <ol className="finder-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)] p-1.5 pb-8">
        {rows.map((r, i) => {
          const on = r.id === selectedId;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                aria-current={on || undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[1.2rem] px-2.5 py-2 text-start ring-1 transition-[background-color,box-shadow] duration-150",
                  on ? "bg-primary/10 ring-primary/40" : "ring-transparent hover:bg-white/[0.04]",
                )}
              >
                <span className={cn("w-5 shrink-0 hud text-[13px]", on ? "text-primary" : "text-muted-foreground")}>
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-foreground">{r.name}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">{r.region || " "}</span>
                </span>
                <span className={cn("w-9 shrink-0 text-end hud text-[16px] font-semibold", scoreTone(r.score))}>
                  {Math.round(r.score)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
