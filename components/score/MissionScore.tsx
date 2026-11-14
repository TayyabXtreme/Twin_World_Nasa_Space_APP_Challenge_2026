"use client";

import { ChevronDown, RotateCcw } from "lucide-react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EvidenceTag } from "@/components/site/EvidenceTag";
import { Slider } from "@/components/ui/slider";
import { measured } from "@/lib/data/metrics";
import { SITES, terrainFor } from "@/lib/data/sites";
import type { Site } from "@/lib/data/types";
import {
  FACTOR_INFO,
  MISSIONS,
  factorGap,
  scoreSite,
  type Confidence,
  type FactorId,
  type Mission,
  type ScoreResult,
} from "@/lib/score";
import { cn } from "@/lib/utils";
import { DatasetBadge } from "./DatasetBadge";
import { FactorRadar } from "./FactorRadar";
import { MissionIcon } from "./MissionIcons";
import { ScoreDial } from "./ScoreDial";

const SCORABLE = SITES.filter((s) => s.world !== "earth");
const DOT = { moon: "bg-moon", mars: "bg-mars", earth: "bg-earth" } as const;
const CONF: Record<Confidence, string> = {
  high: "text-ok ring-ok/35",
  medium: "text-primary ring-primary/35",
  low: "text-warn ring-warn/35",
};
/** One hue per factor, shared by the bar, the radar and the list (labels always accompany the colour). */
const COLOR: Record<FactorId, string> = {
  slope: "oklch(0.86 0.14 182)",
  roughness: "oklch(0.78 0.12 220)",
  rocks: "oklch(0.74 0.06 70)",
  radar: "oklch(0.8 0.11 290)",
  hazards: "oklch(0.72 0.17 25)",
  air: "oklch(0.72 0.13 265)",
  power: "oklch(0.86 0.15 90)",
  comms: "oklch(0.74 0.15 315)",
  dust: "oklch(0.75 0.12 55)",
  water: "oklch(0.75 0.13 240)",
  temperature: "oklch(0.7 0.15 5)",
  science: "oklch(0.8 0.15 150)",
};

type Weights = Partial<Record<FactorId, number>>;

/* ---------- Mission tabs ---------- */

function MissionTabs({ mission, onPick }: { mission: Mission; onPick: (m: Mission) => void }) {
  return (
    <div role="radiogroup" aria-label="Mission type" className="mt-8 grid gap-2.5 sm:grid-cols-3">
      {(Object.keys(MISSIONS) as Mission[]).map((m) => {
        const on = m === mission;
        const top = (Object.entries(MISSIONS[m].weights) as [FactorId, number][])
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([id]) => FACTOR_INFO[id].label.toLowerCase());
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(m)}
            className={cn(
              "group relative isolate flex items-center gap-4 rounded-2xl p-4 text-start ring-1 transition-[box-shadow,transform] duration-200 active:scale-[0.98]",
              on ? "ring-primary/50" : "ring-white/10 hover:ring-white/20",
            )}
          >
            {on && (
              <motion.span
                layoutId="mission-pill"
                className="absolute inset-0 -z-10 rounded-2xl bg-primary/[0.09]"
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
              />
            )}
            <span
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 transition-colors",
                on
                  ? "bg-primary/15 text-primary ring-primary/30"
                  : "bg-white/[0.04] text-muted-foreground ring-white/10 group-hover:text-foreground",
              )}
            >
              <MissionIcon mission={m} className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-heading text-[17px] font-semibold">{MISSIONS[m].label}</span>
              <span className="mt-0.5 block text-xs leading-snug text-pretty text-muted-foreground">
                Weighs {top.join(", ")}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Instrument ---------- */

function Instrument({ site, mission, result }: { site: Site; mission: Mission; result: ScoreResult }) {
  const t = terrainFor(site.id);
  const lola = measured(site.id, "slopeLOLA");
  const readouts = [
    { k: "Elevation", v: t ? `${t.elevationM.toLocaleString("en-GB")} m` : "—" },
    {
      k: lola && t?.slopeDeg == null ? "Slope · 1 km" : "Slope",
      v: t?.slopeDeg != null ? `${t.slopeDeg}°` : lola ? `${lola.value.toFixed(1)}°` : "n/a at pole",
    },
    { k: "Roughness", v: t ? `±${t.roughnessM} m` : "—" },
  ];
  const measuredRows = result.rows.filter((r) => r.basis === "measured");
  const measuredWeight = Math.round(measuredRows.reduce((sum, r) => sum + r.weight, 0) * 100);
  return (
    <div className="flex flex-col rounded-[1.75rem] glass p-5 sm:p-6">
      <ScoreDial key={site.id} score={result.score} caption={MISSIONS[mission].label} />
      <p className="mt-3 text-center text-xs text-muted-foreground">
        <span className="text-primary">
          {measuredRows.length} of {result.rows.length} factors measured
        </span>
        {" · "}
        {measuredWeight}% of the weight
      </p>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.07] pt-4 text-center">
        {readouts.map((r, i) => (
          <div key={r.k} className="score-rise [--base:300ms]" style={{ "--i": i } as React.CSSProperties}>
            <dt className="text-[11px] text-muted-foreground">{r.k}</dt>
            <dd className="mt-0.5 hud text-sm">{r.v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Terrain from {t?.source ?? "LOLA / MOLA"}
        {lola && t?.slopeDeg == null && " · slope from the LOLA 240 m polar map"}
      </p>
      <div className="mt-auto flex flex-wrap items-center justify-center gap-2 pt-5">
        <EvidenceTag evidence="estimate" />
        <Link
          href={`/explore/${site.world}?site=${site.id}`}
          className="rounded-full px-3 py-1 text-sm text-primary ring-1 ring-primary/30 transition-colors duration-150 hover:bg-primary/10"
        >
          See it on the globe
        </Link>
      </div>
    </div>
  );
}

/* ---------- How the score adds up ---------- */

function AddsUp({
  result,
  active,
  setActive,
}: {
  result: ScoreResult;
  active: FactorId | null;
  setActive: (id: FactorId | null) => void;
}) {
  return (
    <section aria-labelledby="adds-title" className="min-w-0">
      <h3 id="adds-title" className="font-heading text-xl font-semibold tracking-tight">
        How the score adds up
      </h3>
      <p className="mt-2 max-w-[62ch] text-muted-foreground">
        Each factor is a 0–1 value from measured NASA data where we have it, or a stated rule on sourced facts,
        multiplied by its weight. The segments are those contributions; together they make the score.
      </p>
      <div
        className="mt-6 flex h-4 w-full overflow-hidden rounded-full bg-white/[0.05] ring-1 ring-white/[0.06]"
        role="img"
        aria-label={`Score ${result.score}: ${result.rows.map((r) => `${FACTOR_INFO[r.id].label} ${Math.round(r.contribution * 100)}`).join(", ")}`}
      >
        {result.rows.map((r) => (
          <span
            key={r.id}
            onPointerEnter={() => setActive(r.id)}
            onPointerLeave={() => setActive(null)}
            className="score-seg h-full border-e border-[oklch(0.12_0.015_265)] last:border-e-0"
            style={{
              width: `${r.contribution * 100}%`,
              background: COLOR[r.id],
              opacity: active && active !== r.id ? 0.3 : 1,
            }}
          />
        ))}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 hud text-xs text-muted-foreground">
        <span className="text-foreground">{result.score}</span>
        <span>=</span>
        {result.rows.map((r, i) => (
          <span key={r.id} className={cn("transition-colors duration-150", active === r.id && "text-foreground")}>
            {i > 0 && "+ "}
            <span style={{ color: COLOR[r.id] }}>{Math.round(r.contribution * 100)}</span>{" "}
            {FACTOR_INFO[r.id].label.toLowerCase()}
          </span>
        ))}
      </p>
    </section>
  );
}

function FactorList({
  rows,
  gaps,
  active,
  setActive,
  siteId,
}: {
  rows: ScoreResult["rows"];
  gaps: { id: FactorId; why: string }[];
  active: FactorId | null;
  setActive: (id: FactorId | null) => void;
  siteId: string;
}) {
  return (
    <div className="min-w-0">
      <ul key={siteId} className="grid gap-1.5">
        {rows.map((r, i) => (
          <li
            key={r.id}
            onPointerEnter={() => setActive(r.id)}
            onPointerLeave={() => setActive(null)}
            className={cn(
              "score-rise rounded-2xl px-4 py-3 ring-1 transition-[background-color,box-shadow] duration-150",
              active === r.id ? "bg-white/[0.05] ring-white/15" : "ring-transparent",
            )}
            style={{ "--i": i } as React.CSSProperties}
          >
            <div className="flex items-center gap-3">
              <span className="size-2 shrink-0 rounded-full" style={{ background: COLOR[r.id] }} aria-hidden />
              <span className="min-w-0 flex-1 text-[15px] font-medium">{FACTOR_INFO[r.id].label}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] ring-1", CONF[r.confidence])}>
                {r.confidence} confidence
              </span>
              <span className="w-10 text-end hud text-sm" title="Contribution to the score">
                +{Math.round(r.contribution * 100)}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3 ps-5">
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                <span
                  className="score-seg block h-full rounded-full"
                  style={{ width: `${r.value * 100}%`, background: COLOR[r.id] }}
                />
              </span>
              <span className="w-10 text-end hud text-xs text-muted-foreground">{r.value.toFixed(2)}</span>
            </div>
            <p className="mt-1.5 ps-5 text-xs leading-relaxed text-muted-foreground">{r.why}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 ps-5">
              {r.datasets.length ? (
                r.datasets.map((d) => <DatasetBadge key={d} id={d} basis={r.basis} />)
              ) : (
                <DatasetBadge basis="rule" />
              )}
            </div>
          </li>
        ))}
      </ul>
      {gaps.length > 0 && (
        <div key={`gaps-${siteId}`} className="mt-3 rounded-2xl px-4 py-3 ring-1 ring-white/[0.07] ring-inset">
          <p className="text-xs font-medium text-foreground/75">Not scored at this site</p>
          <ul className="mt-1.5 grid gap-1.5">
            {gaps.map((g) => (
              <li key={g.id} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                <span
                  className="mt-1.5 size-1.5 shrink-0 rounded-full opacity-60"
                  style={{ background: COLOR[g.id] }}
                  aria-hidden
                />
                <span>
                  <span className="text-foreground/80">{FACTOR_INFO[g.id].label}:</span> {g.why}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">Their weight is shared out over the other factors.</p>
        </div>
      )}
    </div>
  );
}

/* ---------- Planner and ranking ---------- */

function Planner({
  mission,
  weights,
  setWeights,
  missing,
}: {
  mission: Mission;
  weights: Weights;
  setWeights: (w: Weights) => void;
  missing: Set<FactorId>;
}) {
  const defaults = MISSIONS[mission].weights;
  const ids = Object.keys(defaults) as FactorId[];
  const changed = ids.some((k) => Math.abs((weights[k] ?? 0) - (defaults[k] ?? 0)) > 0.001);
  // Shares are of the factors that apply at this site, so they add up to 100 %.
  const total = ids.filter((k) => !missing.has(k)).reduce((s, k) => s + (weights[k] ?? 0), 0) || 1;
  return (
    <section aria-labelledby="weights-title" className="mt-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="weights-title" className="font-heading text-[clamp(1.5rem,2.4vw,2rem)] font-semibold tracking-tight">
            You are the mission planner
          </h2>
          <p className="mt-2 max-w-[56ch] text-muted-foreground">
            Drag to decide what matters. The score, radar and ranking re-plan as you go.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setWeights({ ...defaults })}
          disabled={!changed}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-primary ring-1 ring-primary/30 transition-colors duration-150 hover:bg-primary/10 disabled:text-muted-foreground disabled:opacity-50 disabled:ring-white/10 disabled:hover:bg-transparent"
        >
          <RotateCcw className="size-3.5" aria-hidden /> Reset weights
        </button>
      </div>
      <div className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
        {ids.map((id) => (
          <label key={id} className={cn("block transition-opacity duration-150", missing.has(id) && "opacity-55")}>
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: COLOR[id] }} aria-hidden />
                {FACTOR_INFO[id].label}
              </span>
              <span className="hud text-xs text-muted-foreground">
                {missing.has(id) ? "n/a at this site" : `${Math.round(((weights[id] ?? 0) / total) * 100)}% of score`}
              </span>
            </span>
            <Slider
              className="mt-3"
              min={0}
              max={0.6}
              step={0.01}
              value={[weights[id] ?? 0]}
              onValueChange={([v]) => setWeights({ ...weights, [id]: v })}
              aria-label={`${FACTOR_INFO[id].label} weight`}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function Ranking({
  board,
  siteId,
  mission,
  onSite,
}: {
  board: { site: Site; score: number }[];
  siteId: string;
  mission: Mission;
  onSite: (id: string) => void;
}) {
  const reduce = useReducedMotion();
  return (
    <aside aria-labelledby="board-title" className="rounded-[1.75rem] glass p-4 lg:sticky lg:top-20 lg:self-start">
      <h2 id="board-title" className="px-2 font-heading text-lg font-semibold">
        Ranking · {MISSIONS[mission].label}
      </h2>
      <p className="px-2 text-xs text-muted-foreground">Re-orders live with your weights.</p>
      <LayoutGroup>
        <ol className="mt-3 grid gap-0.5">
          {board.map((b, i) => {
            const current = b.site.id === siteId;
            return (
              <motion.li key={b.site.id} layout={!reduce} transition={{ type: "spring", stiffness: 520, damping: 42 }}>
                <button
                  type="button"
                  onClick={() => onSite(b.site.id)}
                  aria-current={current || undefined}
                  className={cn(
                    "grid w-full grid-cols-[1.4rem_1fr_2.2rem] items-center gap-2 rounded-xl px-2 py-2 text-start transition-colors duration-150",
                    current ? "bg-primary/10" : "hover:bg-white/[0.04]",
                  )}
                >
                  <span className="hud text-xs text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0">
                    <span className={cn("flex items-center gap-1.5 truncate text-sm", current && "text-primary")}>
                      <span className={cn("size-1.5 shrink-0 rounded-full", DOT[b.site.world])} aria-hidden />
                      <span className="truncate">{b.site.name}</span>
                    </span>
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/[0.07]">
                      <span
                        className={cn(
                          "score-seg block h-full rounded-full",
                          b.site.world === "mars" ? "bg-mars" : "bg-moon",
                        )}
                        style={{ width: `${b.score}%` }}
                      />
                    </span>
                  </span>
                  <span className="text-end hud text-sm">{b.score}</span>
                </button>
              </motion.li>
            );
          })}
        </ol>
      </LayoutGroup>
    </aside>
  );
}

/* ---------- Mission score (on Compare) ---------- */

function MissionBody({ site, mission, onSite }: { site: Site; mission: Mission; onSite: (id: string) => void }) {
  const [weights, setWeights] = useState<Weights>({ ...MISSIONS[mission].weights });
  const [active, setActive] = useState<FactorId | null>(null);
  const result = scoreSite(site, weights);
  const ids = Object.keys(weights) as FactorId[];
  const missing = new Set(ids.filter((id) => !result.rows.some((r) => r.id === id)));
  const gaps = ids
    .filter((id) => missing.has(id) && (weights[id] ?? 0) > 0)
    .map((id) => ({ id, why: factorGap(site, id) ?? "Does not apply here." }));
  const board = useMemo(
    () => SCORABLE.map((s) => ({ site: s, score: scoreSite(s, weights).score })).sort((a, b) => b.score - a.score),
    [weights],
  );

  return (
    <>
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:items-start">
        <Instrument site={site} mission={mission} result={result} />
        <div className="min-w-0 rounded-[1.75rem] bg-white/[0.03] p-5 ring-1 ring-white/10 sm:p-6">
          <AddsUp result={result} active={active} setActive={setActive} />
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          <div className="mt-8 grid items-start gap-8 md:grid-cols-[19rem_minmax(0,1fr)]">
            <div className="flex justify-center md:sticky md:top-24">
              <FactorRadar rows={result.rows} colors={COLOR} active={active} onActive={setActive} />
            </div>
            <FactorList rows={result.rows} gaps={gaps} active={active} setActive={setActive} siteId={site.id} />
          </div>
          <Planner mission={mission} weights={weights} setWeights={setWeights} missing={missing} />

          <details className="group mt-12 rounded-[1.5rem] bg-white/[0.025] p-5 ring-1 ring-white/[0.08] open:bg-white/[0.035]">
            <summary className="flex cursor-pointer list-none items-center justify-between font-heading text-lg font-semibold">
              How is this calculated?
              <ChevronDown
                className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <p className="mt-3 max-w-[70ch] text-sm text-muted-foreground">
              Score = sum of (factor value × weight) ÷ sum of weights, shown out of 100. Factors that do not apply (for
              example air for landing on the Moon) are left out and the other weights are re-balanced.
            </p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              {(Object.keys(FACTOR_INFO) as FactorId[]).map((id) => (
                <div key={id}>
                  <dt className="flex items-center gap-2 font-medium">
                    <span className="size-1.5 rounded-full" style={{ background: COLOR[id] }} aria-hidden />
                    {FACTOR_INFO[id].label}
                  </dt>
                  <dd className="mt-0.5 ps-3.5 text-muted-foreground">{FACTOR_INFO[id].rule}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 max-w-[70ch] text-sm text-muted-foreground">
              Regional terrain comes from 16 pixel-per-degree LOLA and MOLA grids (about 2 km and 4 km per pixel); the
              lunar south pole uses LOLA&apos;s 240 m polar slope map. Measured values (Diviner, Mini-RF, Odyssey GRS
              and neutron spectrometer, MGS TES) are averaged within 1–10 km of each site, but the Mars water data see
              hundreds of kilometres at once. Each factor shows its dataset badge, or &ldquo;Rule&rdquo; when none
              applies. This is an educational estimate to explore trade-offs, not how NASA selects landing sites.
            </p>
          </details>
        </div>
        <div className="mt-8">
          <Ranking board={board} siteId={site.id} mission={mission} onSite={onSite} />
        </div>
      </div>
    </>
  );
}

/**
 * Mission suitability for one Moon or Mars site: pick landing, rover or crewed base and watch measured factors add
 * up. Lives on Compare (it replaced the separate /score page); `onSite` switches the pair's Moon/Mars site.
 */
export function MissionScore({ site, onSite }: { site: Site; onSite: (id: string) => void }) {
  const [mission, setMission] = useState<Mission>("landing");
  return (
    <section id="mission-score" className="mt-20 scroll-mt-24" aria-labelledby="mission-score-title">
      <p className="font-mono text-[11px] tracking-[0.16em] text-primary uppercase">Mission score</p>
      <h2
        id="mission-score-title"
        className="mt-2 font-heading text-[clamp(1.5rem,2.4vw,2rem)] font-semibold tracking-tight text-balance"
      >
        Could {site.name} take a landing, a rover or a base?
      </h2>
      <p className="mt-2 max-w-[66ch] text-muted-foreground">
        Pick a mission and watch every factor, from measured NASA data and sourced facts, add up. Change what matters
        yourself, or jump to the best-scoring site for the mission.
      </p>
      <MissionTabs mission={mission} onPick={setMission} />
      {/* Weights reset when the mission or the site changes. */}
      <MissionBody key={`${mission}:${site.id}`} site={site} mission={mission} onSite={onSite} />
    </section>
  );
}
