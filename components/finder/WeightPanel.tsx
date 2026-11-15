"use client";

import { RotateCcw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { DIM_HINT, DIM_LABEL, describeTarget } from "@/lib/finder/text";
import { DIM_IDS, type DimId, type Target, type Weights } from "@/lib/finder/types";
import { cn } from "@/lib/utils";

export interface LearnedWeights {
  /** One weight per parameter; null = not learned (keeps the hand-set weight). */
  weights: Record<string, number | null>;
  recall5: { learnedLOPO: number; learnedLOSO: number; hand: number; equal: number };
  pairs?: unknown[];
}

/** Learned weights apply only when they were trained on the current thirteen parameters. */
export const learnedFits = (l: LearnedWeights | null): l is LearnedWeights =>
  !!l && DIM_IDS.every((d) => d in l.weights);

const MODE_TAG: Record<string, { label: string; cls: string }> = {
  near: { label: "direct", cls: "bg-primary/10 text-primary" },
  toward: { label: "beyond Earth", cls: "bg-warn/10 text-warn" },
  rank: { label: "rank", cls: "bg-primary/10 text-primary" },
  match: { label: "evidence", cls: "bg-ok/10 text-ok" },
};

/**
 * The weight sliders, one per parameter of the site-vs-target breakdown. Each row is a name, a value and a slider;
 * what the target asks of Earth on that parameter opens under whichever slider you are touching.
 */
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
  const fits = learnedFits(learned);
  return (
    <section aria-label="Parameter weights">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">Weight set</p>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-white/10 transition-colors duration-150 hover:text-foreground hover:ring-white/20"
        >
          <RotateCcw className="size-3" aria-hidden />
          Reset
        </button>
      </div>
      {fits && (
        <div
          role="group"
          aria-label="Weight set"
          className="mt-2 flex rounded-xl bg-white/[0.05] p-0.5 ring-1 ring-white/10"
        >
          {(["default", "learned"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => onMode(m)}
              className={cn(
                "flex-1 rounded-lg px-2 py-1.5 text-[13px] transition-colors duration-150",
                mode === m ? "bg-white/12 text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "default" ? "Hand-set" : "Learned"}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 rounded-xl bg-white/[0.035] p-3.5 ring-1 ring-white/[0.08]">
        {mode === "learned" && fits ? (
          <>
            <p className="text-[13px] font-semibold">Learned weights</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              Fitted by a small model to {learned.pairs?.length ?? 23} places NASA already uses as analogues (Atacama
              for Jezero, McMurdo for Phoenix…), so those sites rank as high as possible. One set for both worlds;
              aqueous geochemistry keeps its hand-set weight because only catalogued sites carry it.
            </p>
          </>
        ) : mode === "custom" ? (
          <>
            <p className="text-[13px] font-semibold">Your own weights</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              You moved a slider, so the ranking now follows your priorities. Reset returns to the hand-set weights.
            </p>
          </>
        ) : (
          <>
            <p className="text-[13px] font-semibold">Hand-set weights (default)</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              Chosen by the TwinWorlds team from planetary science, with a separate set per world:{" "}
              {target.world === "moon"
                ? "for Moon bases, extreme cold, water ice and the airless sky count most."
                : "for Mars sites, dryness, water-formed minerals and cold count most."}
            </p>
          </>
        )}
        {fits && (
          <p className="mt-2.5 border-t border-white/[0.07] pt-2.5 text-[12px] leading-snug text-muted-foreground">
            Test with one NASA analogue hidden: it lands in Earth&apos;s top 5 %{" "}
            <span className="hud text-foreground">{Math.round(learned.recall5.hand * 100)} %</span> of the time with
            hand-set weights and{" "}
            <span className="hud text-foreground">{Math.round(learned.recall5.learnedLOPO * 100)} %</span> with learned
            ones.{" "}
            <Link href="/models#learned-weights" className="text-primary hover:underline">
              Model card
            </Link>
          </p>
        )}
      </div>
      <ul className="mt-5 space-y-1" onMouseLeave={() => setFocus(null)}>
        {DIM_IDS.map((d) => {
          const spec = target.params[d];
          const has = Boolean(spec);
          const w = weights[d] ?? 0;
          const open = focus === d && spec;
          return (
            <li
              key={d}
              className={cn(
                "rounded-xl px-2 py-2 transition-colors duration-150",
                !has && "opacity-45",
                focus === d && "bg-white/[0.04]",
              )}
              onMouseEnter={() => setFocus(d)}
              onFocus={() => setFocus(d)}
              onPointerDown={() => setFocus(d)}
            >
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={`w-${d}`} className="text-sm font-medium" title={DIM_HINT[d]}>
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
              {!has && <p className="mt-1.5 text-[11.5px] text-muted-foreground">No value for {target.name}</p>}
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    key="hint"
                    initial={reduce ? false : { height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={reduce ? undefined : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                    aria-live="polite"
                  >
                    <p className="pt-2 text-[12px] leading-snug text-muted-foreground">
                      <span
                        className={cn(
                          "me-1.5 rounded-full px-1.5 py-px text-[10px] tracking-wide uppercase",
                          MODE_TAG[spec.mode].cls,
                        )}
                      >
                        {MODE_TAG[spec.mode].label}
                      </span>
                      Target: <span className="text-foreground">{describeTarget(d, spec, target.world)}</span>
                    </p>
                    <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground/80">{DIM_HINT[d]}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
