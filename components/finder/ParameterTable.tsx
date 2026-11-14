"use client";

import { ChevronDown } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { ParamRow } from "@/lib/finder/text";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

const SOURCE_STYLE: Record<ParamRow["source"], string> = {
  measured: "text-ok",
  derived: "text-primary",
  computed: "text-muted-foreground",
};

const simTone = (pct: number) =>
  pct >= 75 ? "text-ok" : pct >= 50 ? "text-primary" : pct >= 25 ? "text-warn" : "text-destructive";
const simBar = (pct: number) =>
  pct >= 75 ? "bg-ok" : pct >= 50 ? "bg-primary" : pct >= 25 ? "bg-warn" : "bg-destructive/80";

/**
 * Per-parameter breakdown for one Earth place against one Moon or Mars target. By default: parameter, the Earth
 * value, the target value and how well they match. "Show details" adds tolerance, weight, source, ranks and notes,
 * and the row that adds the matches up into the overall score.
 */
export function ParameterTable({ rows, worldName, score }: { rows: ParamRow[]; worldName: string; score: number }) {
  const reduce = useReducedMotion();
  const [more, setMore] = useState(false);
  const totalWeight = rows.reduce((s, r) => s + r.weight, 0);
  const weighted =
    totalWeight > 0 ? Math.round((100 * rows.reduce((s, r) => s + r.weight * r.similarity, 0)) / totalWeight) : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">How it matches, parameter by parameter</h4>
        <button
          type="button"
          onClick={() => setMore(!more)}
          aria-expanded={more}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-white/12 transition-colors hover:text-foreground hover:ring-white/25"
        >
          {more ? "Hide details" : "Show details"}
          <ChevronDown className={cn("size-3.5 transition-transform duration-200", more && "rotate-180")} aria-hidden />
        </button>
      </div>
      <div className="mt-3 overflow-x-auto rounded-2xl ring-1 ring-white/10">
        <table className={cn("w-full text-left text-[13px]", more && "min-w-[760px]")}>
          <caption className="sr-only">Earth value, {worldName} value and match for each parameter</caption>
          <thead className="bg-white/[0.04] text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="py-2.5 ps-4 pe-2 font-medium">
                Parameter
              </th>
              <th scope="col" className="px-2 py-2.5 text-end font-medium">
                Earth
              </th>
              <th scope="col" className="px-2 py-2.5 text-end font-medium">
                {worldName}
              </th>
              {more && (
                <>
                  <th scope="col" className="px-2 py-2.5 font-medium">
                    Tolerance
                  </th>
                  <th scope="col" className="px-2 py-2.5 text-end font-medium">
                    Weight
                  </th>
                  <th scope="col" className="px-2 py-2.5 font-medium">
                    Source
                  </th>
                </>
              )}
              <th scope="col" className="py-2.5 ps-2 pe-4 text-end font-medium">
                Match
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06] align-top">
            {rows.map((r, i) => {
              const pct = Math.round(r.similarity * 100);
              const off = r.weight === 0;
              return (
                <motion.tr
                  key={r.dim}
                  className={cn("transition-colors duration-150 hover:bg-white/[0.03]", off && "opacity-45")}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: off ? 0.45 : 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.04, ease: EASE }}
                >
                  <th scope="row" className="py-3 ps-4 pe-2 font-normal">
                    <span className="block font-medium text-foreground">{r.parameter}</span>
                    <span className="block text-[11px] text-muted-foreground">{r.units}</span>
                    {more && r.caveat && (
                      <span className="mt-0.5 block max-w-[26ch] text-[10.5px] leading-snug text-warn/90">
                        {r.caveat}
                      </span>
                    )}
                    {off && (
                      <span className="mt-0.5 block text-[10.5px] text-muted-foreground">weight 0, not scored</span>
                    )}
                  </th>
                  <td className="px-2 py-3 text-end">
                    <span className="hud whitespace-nowrap text-foreground">{r.site}</span>
                    {more && r.siteRank !== undefined && (
                      <span className="block text-[10.5px] text-muted-foreground">rank {r.siteRank} of Earth</span>
                    )}
                  </td>
                  <td className="px-2 py-3 text-end">
                    <span
                      className={cn(
                        "hud whitespace-nowrap",
                        r.target === "not measured" ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {r.target}
                    </span>
                    {more && r.targetRank !== undefined && (
                      <span className="block text-[10.5px] text-muted-foreground">
                        rank {r.targetRank} of {worldName}
                      </span>
                    )}
                  </td>
                  {more && (
                    <>
                      <td className="px-2 py-3 text-[12px] text-muted-foreground">{r.tolerance}</td>
                      <td className="px-2 py-3 text-end">
                        <span className="hud text-foreground">{r.weight.toFixed(2)}</span>
                        {totalWeight > 0 && (
                          <span className="block text-[10.5px] text-muted-foreground">
                            {Math.round((r.weight / totalWeight) * 100)} %
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <span className={cn("text-[12px] font-medium", SOURCE_STYLE[r.source])}>{r.source}</span>
                        <span className="block max-w-[22ch] text-[10.5px] leading-snug text-muted-foreground">
                          Earth: {r.earthSource}
                          <br />
                          {worldName}: {r.targetSource}
                        </span>
                      </td>
                    </>
                  )}
                  <td className="py-3 ps-2 pe-4 text-end">
                    <span className={cn("hud text-sm font-semibold", simTone(pct))}>{pct} %</span>
                    <span className="ms-auto mt-1.5 block h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.07]">
                      <motion.span
                        className={cn("block h-full origin-left rounded-full", simBar(pct))}
                        initial={reduce ? false : { scaleX: 0 }}
                        animate={{ scaleX: Math.max(0.03, r.similarity) }}
                        transition={{ duration: 0.6, delay: i * 0.05, ease: EASE }}
                      />
                    </span>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
          {more && (
            <tfoot className="border-t border-white/10 bg-white/[0.03]">
              <tr>
                <th
                  scope="row"
                  colSpan={4}
                  className="py-3 ps-4 pe-2 text-start text-[12px] font-normal text-muted-foreground"
                >
                  Score = Σ (weight × match) ÷ Σ weight
                </th>
                <td className="px-2 py-3 text-end hud text-foreground">{totalWeight.toFixed(2)}</td>
                <td className="px-2 py-3" />
                <td className="py-3 ps-2 pe-4 text-end">
                  <span className={cn("hud text-base font-semibold", simTone(weighted))}>{weighted} %</span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        The score{score !== weighted ? ` (${score})` : ""} is the weighted average of these matches.
        {more
          ? ` Rank = percentile within each world (0 = coldest, smallest or driest). Where a value cannot exist on Earth, it is matched by rank, so Earth's coldest ground stands in for the coldest on ${worldName}.`
          : " Show details for tolerance, weight and the dataset behind every number."}
      </p>
    </div>
  );
}
