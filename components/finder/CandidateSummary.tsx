"use client";

import { ArrowDown } from "lucide-react";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import type { PlaceLabel } from "@/lib/finder/places";
import { DIM_LABEL, DIM_SHORT, WORLD_LIMITS, fieldTests, strengths } from "@/lib/finder/text";
import { DIM_IDS, type CellResult, type Target } from "@/lib/finder/types";
import { cn } from "@/lib/utils";

const tone = (s: number) => (s >= 75 ? "ok" : s >= 50 ? "primary" : "warn");
const TEXT = { ok: "text-ok", primary: "text-primary", warn: "text-warn" } as const;
const BG = { ok: "bg-ok", primary: "bg-primary", warn: "bg-warn" } as const;

function Line({ color, label, children }: { color: keyof typeof TEXT; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className={cn("mt-[5px] size-2 shrink-0 rounded-full", BG[color])} aria-hidden />
      <div>
        <p className={cn("text-[12px] font-semibold tracking-wide uppercase", TEXT[color])}>{label}</p>
        <p className="mt-1 text-[14px] leading-snug text-foreground/90">{children}</p>
      </div>
    </div>
  );
}

const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * The selected place at a glance, beside the map: score, three plain lines (what matches, what differs, what to test
 * there) and one bar per parameter. The full breakdown sits below the map.
 */
export function CandidateSummary({
  cell,
  label,
  rank,
  target,
  confidence,
  onFull,
}: {
  cell: CellResult;
  label: PlaceLabel;
  rank: number | null;
  target: Target;
  confidence: number;
  onFull: () => void;
}) {
  const score = Math.round(cell.score * 100);
  const better = 100 - cell.topPct;
  const betterText = better >= 99.95 ? "99.9%+" : `${better.toFixed(better > 99 ? 1 : 0)}%`;
  const strong = strengths(cell)
    .slice(0, 3)
    .map((s) => DIM_SHORT[s.dim].toLowerCase());
  const weakDims = DIM_IDS.filter((d) => cell.sims[d] !== undefined && cell.sims[d]! < 0.5).map((d) =>
    DIM_SHORT[d].toLowerCase(),
  );
  const limits = WORLD_LIMITS[target.world]
    .filter((l) => l.title === "Gravity" || l.title === "Chemistry")
    .map((l) => l.title.toLowerCase());
  const test = fieldTests(cell)[0];
  const dims = DIM_IDS.filter((d) => cell.sims[d] !== undefined);

  return (
    <article
      key={`${cell.cell}:${target.id}`}
      aria-labelledby="summary-title"
      className="finder-rise flex min-h-0 flex-col overflow-hidden rounded-[1.6rem] bg-white/[0.03] ring-1 ring-white/10"
    >
      <header className="border-b border-white/[0.07] px-5 pt-4 pb-4">
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          {rank ? `#${rank} for ${target.name}` : `Your pick · scored for ${target.name}`}
          {label.known && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-[12px] text-ok">Known analogue</span>}
        </p>
        <div className="mt-1.5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="summary-title" className="font-heading text-[1.45rem] leading-tight font-semibold tracking-tight">
              {label.title}
            </h2>
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground" title={label.subtitle}>
              {label.subtitle}
            </p>
          </div>
          <div className="shrink-0 text-end">
            <AnimatedNumber
              value={score}
              className={cn("block hud text-[2.4rem] leading-none font-semibold", TEXT[tone(score)])}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">match / 100</p>
          </div>
        </div>
        <p className="mt-2.5 text-[13px] text-muted-foreground">
          Better than <span className="font-semibold text-foreground">{betterText}</span> of Earth&apos;s land
          {confidence < 70 && (
            <span className="text-warn" title="Share of the score resting on direct measurements on both worlds">
              {" "}
              · low data confidence ({confidence})
            </span>
          )}
        </p>
      </header>

      <div className="finder-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="space-y-3.5 px-5 py-4">
          <Line color="ok" label="Matches on">
            {strong.length
              ? `${list(strong).replace(/^./, (c) => c.toUpperCase())}.`
              : "No single parameter matches strongly here."}
          </Line>
          <Line color="warn" label="Differs on">
            {weakDims.length ? `${list(weakDims).replace(/^./, (c) => c.toUpperCase())}. ` : ""}
            No Earth site matches {list(limits)}.
          </Line>
          {test && (
            <Line color="primary" label="Good for testing">
              {test}
            </Line>
          )}
        </div>

        <div className="border-t border-white/[0.07] px-5 py-4">
          <p className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Each parameter</p>
          <ul className="mt-3 space-y-2">
            {dims.map((d) => {
              const s = Math.round(cell.sims[d]! * 100);
              return (
                <li key={d} className="flex items-center gap-3">
                  <span className="w-[7.5rem] shrink-0 truncate text-[13px] text-foreground/90" title={DIM_LABEL[d]}>
                    {DIM_SHORT[d]}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                    <span
                      className={cn(
                        "block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500",
                        BG[tone(s)],
                      )}
                      style={{ width: `${s}%` }}
                    />
                  </span>
                  <span className="w-7 shrink-0 text-end hud text-[12px]">{s}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/[0.07] p-3">
        <button
          type="button"
          onClick={onFull}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-[scale] duration-150 ease-out motion-safe:enabled:active:scale-[0.96]"
        >
          Full breakdown <ArrowDown className="size-4" aria-hidden />
        </button>
      </div>
    </article>
  );
}
