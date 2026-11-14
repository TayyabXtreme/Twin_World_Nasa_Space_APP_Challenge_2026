"use client";

import { Info, RotateCcw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { DIM_HINT, DIM_LABEL, pctText } from "@/lib/finder/text";
import { DIM_IDS, type DimId, type Target, type Weights } from "@/lib/finder/types";
import { cn } from "@/lib/utils";

/** One line saying what the target asks of Earth on this dimension. */
function ask(d: DimId, target: Target) {
  const s = target.dims[d];
  if (!s) return "No data for this target";
  if (s.mode === "role") {
    const ep = s.earthPct ?? 0.5;
    if (d === "cold")
      return ep < 0.5 ? `Earth's coldest ${pctText(ep)} % of land` : `Warmer than ${pctText(ep)} % of land`;
    if (d === "ice") return ep < 0.3 ? "Ground that never freezes" : `Earth's most frozen ${pctText(1 - ep)} %`;
    if (d === "swing")
      return ep < 0.5
        ? `Smaller swing than ${pctText(1 - ep)} % of bare land`
        : `Larger swing than ${pctText(ep)} % of bare land`;
    if (d === "inertia")
      return ep < 0.5 ? `Looser than ${pctText(1 - ep)} % of bare land` : `Rockier than ${pctText(ep)} % of bare land`;
  }
  if (d === "bare") return "NDVI 0, no plants";
  if (d === "sun") return `Noon Sun up to ${s.earthTarget?.toFixed(1)}° high`;
  if (d === "relief") return `${Math.round(s.earthTarget ?? 0)} m relief`;
  return "";
}

/**
 * The weight sliders. Each row is just a name, a value and a slider; what the target asks of Earth on that dimension
 * shows in one hint line for whichever slider you are touching, instead of seven lines of text at once.
 */
export interface LearnedWeights {
  weights: Record<string, number>;
  recall5: { learnedLOPO: number; learnedLOSO: number; hand: number; equal: number };
}

export function WeightPanel({
  target,
  weights,
  onChange,
  onReset,
  mode,
  onMode,
  learned,
}: {
  target: Target;
  weights: Weights;
  onChange: (w: Weights) => void;
  onReset: () => void;
  mode: "default" | "learned" | "custom";
  onMode: (m: "default" | "learned") => void;
  learned: LearnedWeights | null;
}) {
  const reduce = useReducedMotion();
  const [focus, setFocus] = useState<DimId | null>(null);
  const shown = focus ?? DIM_IDS.find((d) => target.dims[d]) ?? DIM_IDS[0];
  const shownMode = target.dims[shown]?.mode;
  return (
    <section
      aria-labelledby="weights-title"
      className="rounded-[1.6rem] bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="weights-title" className="font-heading text-base font-semibold">
          What matters
        </h2>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-white/10 transition-colors duration-150 hover:text-foreground hover:ring-white/20"
        >
          <RotateCcw className="size-3" aria-hidden />
          Reset
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Drag to weigh each dimension. The map re-scores instantly.</p>
      {learned && (
        <div className="mt-3">
          <div role="group" aria-label="Weight set" className="flex rounded-xl bg-white/[0.05] p-0.5 ring-1 ring-white/10">
            {(["default", "learned"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => onMode(m)}
                className={cn("flex-1 rounded-lg px-2 py-1 text-xs transition-colors duration-150", mode === m ? "bg-white/12 text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {m === "default" ? "Hand-set" : "Learned"}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            Test: held-out NASA analogue in Earth&apos;s top 5 %: learned <span className="hud text-foreground">{Math.round(learned.recall5.learnedLOPO * 100)} %</span> · hand-set{" "}
            <span className="hud text-foreground">{Math.round(learned.recall5.hand * 100)} %</span> ({Math.round(learned.recall5.learnedLOSO * 100)} % leave-one-site-out).{" "}
            <Link href="/models#learned-weights" className="text-primary hover:underline">
              Model card
            </Link>
          </p>
        </div>
      )}
      <ul className="mt-4 space-y-3" onMouseLeave={() => setFocus(null)}>
        {DIM_IDS.map((d) => {
          const has = Boolean(target.dims[d]);
          const w = weights[d];
          return (
            <li
              key={d}
              className={cn(
                "rounded-xl px-2 py-1.5 transition-colors duration-150",
                !has && "opacity-45",
                focus === d && "bg-white/[0.04]",
              )}
              onMouseEnter={() => has && setFocus(d)}
              onFocus={() => has && setFocus(d)}
              onPointerDown={() => has && setFocus(d)}
            >
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={`w-${d}`} className="flex items-center gap-2 text-sm font-medium" title={DIM_HINT[d]}>
                  {DIM_LABEL[d]}
                </label>
                <span className="w-9 text-end hud text-xs text-muted-foreground">
                  {has ? `${Math.round(w * 100)}` : "–"}
                </span>
              </div>
              <Slider
                id={`w-${d}`}
                className="mt-2"
                min={0}
                max={1}
                step={0.05}
                value={[has ? w : 0]}
                disabled={!has}
                aria-label={`${DIM_LABEL[d]} weight`}
                onValueChange={([v]) => onChange({ ...weights, [d]: v })}
              />
            </li>
          );
        })}
      </ul>
      {/* What the target asks for on the dimension in focus. */}
      <div
        className="mt-4 min-h-[4.25rem] rounded-xl bg-primary/[0.06] px-3 py-2.5 ring-1 ring-primary/15"
        aria-live="polite"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={shown}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <Info className="size-3.5 text-primary" aria-hidden />
              {DIM_LABEL[shown]}
              {shownMode && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-px text-[10px] font-normal tracking-wide uppercase",
                    shownMode === "role" ? "bg-primary/10 text-primary" : "bg-warn/10 text-warn",
                  )}
                >
                  {shownMode === "role" ? "rank" : "absolute"}
                </span>
              )}
            </p>
            <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
              Target asks for: <span className="text-foreground">{ask(shown, target)}</span>
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
