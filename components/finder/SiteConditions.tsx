"use client";

import { BarChart3, ChevronDown, Table2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import {
  conditionRows,
  fetchClimate,
  fetchSand,
  isMissing,
  type ConditionRow,
  type EarthClimate,
} from "@/lib/finder/conditions";
import type { KnownPlace } from "@/lib/finder/places";
import type { CellResult, ParamsHeader, Target } from "@/lib/finder/types";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

/** A live lookup tagged with the cell it belongs to, so a stale answer never shows for a newly picked place. */
interface Tagged<T> {
  key: string;
  value: T;
}

/**
 * Site vs target: the thirteen parameters the ranking uses, for the selected Earth place and the Moon or Mars target.
 * Climate and soil values load live from NASA POWER and SoilGrids (falling back to the gridded values); the rest come
 * from our grids and the targets' data. "Show sources" names the dataset behind every number; "Graph" shows each
 * row's match, the same similarity the score is built from. Rows with no value on one side are left out.
 */
export function SiteConditions({
  cell,
  target,
  known,
  params,
  siteName,
}: {
  cell: CellResult;
  target: Target;
  known?: KnownPlace;
  params: ParamsHeader;
  siteName: string;
}) {
  const reduce = useReducedMotion();
  const [sources, setSources] = useState(false);
  const [graph, setGraph] = useState(false);
  const [climate, setClimate] = useState<Tagged<EarthClimate | null> | null>(null);
  const [sand, setSand] = useState<Tagged<number | null> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cellKey = `${cell.lat},${cell.lon}`;

  useEffect(() => {
    let live = true;
    fetchClimate(cell.lat, cell.lon).then((value) => live && setClimate({ key: cellKey, value }));
    fetchSand(cell.lat, cell.lon).then((value) => live && setSand({ key: cellKey, value }));
    return () => {
      live = false;
    };
  }, [cell.lat, cell.lon, cellKey, attempt]);

  const rows = useMemo(
    () =>
      conditionRows({
        cell,
        target,
        known,
        params,
        climate: climate?.key === cellKey ? climate.value : undefined,
        sand: sand?.key === cellKey ? sand.value : undefined,
      }),
    [cell, target, known, params, climate, sand, cellKey],
  ).filter((r) => !isMissing(r.site) && !isMissing(r.target));
  const unreachable = rows.filter((r) => r.unreachable).length;
  const offline = climate?.key === cellKey && climate.value === null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">Site vs target, parameter by parameter</h4>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {unreachable} of {rows.length} {target.name} conditions exist nowhere on Earth.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setGraph(!graph)}
            aria-pressed={graph}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs ring-1 transition-colors",
              graph
                ? "bg-primary/12 text-primary ring-primary/35 hover:bg-primary/18"
                : "text-muted-foreground ring-white/12 hover:text-foreground hover:ring-white/25",
            )}
          >
            {graph ? <Table2 className="size-3.5" aria-hidden /> : <BarChart3 className="size-3.5" aria-hidden />}
            {graph ? "Table" : "Graph"}
          </button>
          {!graph && (
            <button
              type="button"
              onClick={() => setSources(!sources)}
              aria-expanded={sources}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-white/12 transition-colors hover:text-foreground hover:ring-white/25"
            >
              {sources ? "Hide sources" : "Show sources"}
              <ChevronDown
                className={cn("size-3.5 transition-transform duration-200", sources && "rotate-180")}
                aria-hidden
              />
            </button>
          )}
        </div>
      </div>
      {graph ? (
        <MatchGraph rows={rows} targetName={target.name} siteName={siteName} score={cell.score} />
      ) : (
        <div className="mt-3 overflow-x-auto rounded-2xl ring-1 ring-white/10">
          <table className={cn("w-full text-left text-[13px]", sources && "min-w-[640px]")}>
            <caption className="sr-only">
              Conditions at {siteName} and at {target.name} for each parameter
            </caption>
            <thead className="bg-white/[0.04] text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="py-2.5 ps-4 pe-2 font-medium">
                  Parameter
                </th>
                <th scope="col" className="px-2 py-2.5 text-end font-medium">
                  Site
                </th>
                <th scope="col" className="py-2.5 ps-2 pe-4 text-end font-medium">
                  Target
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] align-top">
              {rows.map((r, i) => (
                <motion.tr
                  key={r.id}
                  className="transition-colors duration-150 hover:bg-white/[0.03]"
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.035, ease: EASE }}
                >
                  <th scope="row" className="py-3 ps-4 pe-2 font-normal">
                    <span className="block font-medium text-foreground">{r.parameter}</span>
                    <span className="block text-[11px] text-muted-foreground">{r.units}</span>
                    {r.unreachable && (
                      <span className="mt-1 inline-block rounded-full bg-warn/12 px-2 py-0.5 text-[10.5px] text-warn">
                        unreachable on Earth
                      </span>
                    )}
                    {r.note && (
                      <span className="mt-0.5 block max-w-[30ch] text-[10.5px] leading-snug text-muted-foreground">
                        {r.note}
                      </span>
                    )}
                  </th>
                  <td className="px-2 py-3 text-end">
                    <span
                      className={cn(
                        "hud text-foreground",
                        r.site.length > 14 ? "inline-block max-w-[20ch] text-[12px] leading-snug" : "whitespace-nowrap",
                        r.site === "…" && "animate-pulse text-muted-foreground",
                        r.site === "unavailable" && "text-[12px] text-muted-foreground",
                      )}
                    >
                      {r.site}
                    </span>
                    {sources && (
                      <span className="ms-auto mt-1 block max-w-[24ch] text-[10.5px] leading-snug text-muted-foreground">
                        {r.siteSource}
                      </span>
                    )}
                  </td>
                  <td className="py-3 ps-2 pe-4 text-end">
                    <span
                      className={cn(
                        "hud",
                        r.unreachable ? "text-warn" : "text-foreground",
                        /^(–|not measured|no )/.test(r.target) && "text-muted-foreground",
                        r.target.length > 14
                          ? "inline-block max-w-[20ch] text-[12px] leading-snug"
                          : "whitespace-nowrap",
                      )}
                    >
                      {r.target}
                    </span>
                    {sources && (
                      <span className="ms-auto mt-1 block max-w-[24ch] text-[10.5px] leading-snug text-muted-foreground">
                        {r.targetSource}
                      </span>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {offline ? (
          <>
            NASA POWER is busy, so the climate values come from our 0.25° grid of the same dataset.{" "}
            <button
              type="button"
              onClick={() => {
                setClimate(null);
                setAttempt((a) => a + 1);
              }}
              className="text-primary underline-offset-2 hover:underline"
            >
              Try again
            </button>
            .{" "}
          </>
        ) : (
          "Climate values load live from NASA POWER for this 28 km cell. "
        )}
        The score is the weighted average of these rows&apos; match; set the weights in Adjust what matters.
        {graph || sources ? "" : " Show sources for the dataset behind every number."}
      </p>
    </div>
  );
}

const GRID = [0, 25, 50, 75, 100];
const COLS = "grid-cols-[8.5rem_1fr_2.75rem] sm:grid-cols-[10.5rem_1fr_2.75rem]";

/**
 * One bar per parameter: the similarity the ranking used for this place (0–100 %). Where the target lies beyond
 * anything on Earth the bar is amber and ranks how far this place goes toward it; hovering or focusing a bar shows
 * both values.
 */
function MatchGraph({
  rows,
  targetName,
  siteName,
  score,
}: {
  rows: ConditionRow[];
  targetName: string;
  siteName: string;
  score: number;
}) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);
  const plotted = rows.filter((r) => r.match !== undefined);
  const left = rows.filter((r) => r.match === undefined).map((r) => r.parameter);

  return (
    <figure className="mt-3 rounded-2xl bg-white/[0.02] p-4 ring-1 ring-white/10 sm:p-5">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[13px] text-muted-foreground">
          How close {siteName} comes to {targetName}, condition by condition
        </span>
        <span className="text-[13px] text-muted-foreground">
          Weighted score <span className="hud text-base font-semibold text-foreground">{Math.round(score * 100)}</span>{" "}
          / 100
        </span>
      </figcaption>

      <ul className="mt-4">
        {plotted.map((r, i) => {
          const pct = Math.round((r.match ?? 0) * 100);
          const on = hover === r.id;
          return (
            <li
              key={r.id}
              tabIndex={0}
              onMouseEnter={() => setHover(r.id)}
              onMouseLeave={() => setHover((h) => (h === r.id ? null : h))}
              onFocus={() => setHover(r.id)}
              onBlur={() => setHover((h) => (h === r.id ? null : h))}
              aria-label={`${r.parameter}: ${pct} % match. Site ${r.site}, target ${r.target}${r.toward ? ", beyond Earth: ranked by how far this place goes toward it" : ""}`}
              className={cn(
                "relative grid items-center gap-x-3 rounded-lg py-2 ps-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                COLS,
                on && "bg-white/[0.04]",
              )}
            >
              <span className="truncate text-end text-[12.5px] text-foreground/90">{r.parameter}</span>
              <span className="relative h-2.5">
                {/* Recessive grid lines, drawn per row so they line up with the bars exactly */}
                {GRID.map((g) => (
                  <span
                    key={g}
                    aria-hidden
                    className={cn("absolute -inset-y-2 w-px", g === 0 ? "bg-white/25" : "bg-white/[0.06]")}
                    style={{ left: `${g}%` }}
                  />
                ))}
                <motion.span
                  className={cn(
                    "absolute inset-y-0 start-0 origin-left rounded-e-[4px] transition-colors",
                    r.toward ? (on ? "bg-warn" : "bg-warn/70") : on ? "bg-primary" : "bg-primary/75",
                  )}
                  style={{ width: `${Math.max(pct, 1)}%` }}
                  initial={reduce ? false : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.55, delay: i * 0.04, ease: EASE }}
                />
              </span>
              <span className="text-end hud text-[12px] text-muted-foreground">{pct}%</span>

              {on && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute end-12 bottom-full z-10 mb-1 w-max max-w-[18rem] rounded-xl bg-popover px-3 py-2 text-[11.5px] leading-snug text-popover-foreground shadow-lg ring-1 ring-white/12"
                >
                  <span className="block font-medium">
                    {r.parameter} <span className="font-normal text-muted-foreground">· {r.units}</span>
                  </span>
                  <span className="block text-muted-foreground">
                    Site <span className="hud text-foreground">{r.site}</span> · Target{" "}
                    <span className="hud text-foreground">{r.target}</span>
                  </span>
                  {r.toward && (
                    <span className="mt-0.5 block text-warn">Beyond Earth: ranks how far this place goes toward it</span>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className={cn("mt-1 grid gap-x-3 ps-1", COLS)} aria-hidden>
        <span />
        <span className="relative h-4 text-[10px] text-muted-foreground">
          {GRID.map((g) => (
            <span
              key={g}
              className={cn("absolute hud", g === 0 ? "" : g === 100 ? "-translate-x-full" : "-translate-x-1/2")}
              style={{ left: `${g}%` }}
            >
              {g}%
            </span>
          ))}
        </span>
        <span />
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Teal bars: 100 % means the site has the target&apos;s value; one typical step away (15 °C, 20 % sand, 3 h of
        daylight) scores 61 %, two steps 14 %. Amber bars: the target is beyond anything on Earth, so they show the
        share of Earth&apos;s land this place beats in that direction. Elevation compares rank within each world.
        {left.length ? ` Not plotted: ${left.join(", ")} (no value for this target).` : ""}
      </p>
    </figure>
  );
}
